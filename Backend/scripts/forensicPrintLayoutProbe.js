/**
 * FORENSIC PROBE — Analyze Print Layout pipeline (pre-Gemini stages).
 * ------------------------------------------------------------------
 * Replicates the EXACT logic from Controllers/printLayoutController.js
 * (fetchImageBuffer / normalizeImageBuffer / safeParse) and prints every
 * stage the pipeline goes through BEFORE the Gemini call, so a failing
 * stage can be identified immediately.
 *
 * Usage:
 *   node Backend/scripts/forensicPrintLayoutProbe.js <imageUrl>
 *
 * Stages printed:
 *   1. Incoming image URL
 *   2. Public accessibility (HTTP status on download)
 *   3. Content-Type (MIME) header
 *   4. Content-Length header
 *   5. Raw buffer size (bytes)
 *   6. Image dimensions (sharp metadata, pre-normalization)
 *   7. Normalization result (resized? output MIME + size)
 *   8. Whether the MIME is in Gemini's supported set (jpeg/png/webp/heic/heif)
 *   9. safeParse() against a realistic Gemini-style JSON payload
 *   10. Final layout object shape
 *
 * No Gemini API call is made — this probe never touches quota.
 */
import sharp from "sharp";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node Backend/scripts/forensicPrintLayoutProbe.js <imageUrl>");
  process.exit(1);
}

const MAX_ANALYSIS_WIDTH = 1200;

function isUnsafeImageUrl(imageUrl) {
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
    if (host.startsWith("[::") || host === "::1" || host === "::") return true;
    return false;
  } catch {
    return true;
  }
}

async function fetchImageBuffer(imageUrl) {
  const imgRes = await fetch(imageUrl);
  console.log("  [2] HTTP status on download:        ", imgRes.status, imgRes.statusText);
  console.log("  [3] Content-Type header:            ", imgRes.headers.get("content-type") || "(none)");
  const length = Number(imgRes.headers.get("content-length") || 0);
  console.log("  [4] Content-Length header:          ", length ? `${(length / 1024).toFixed(1)} KB` : "(none)");
  if (!imgRes.ok) throw new Error("Could not fetch the product image");
  const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("The product image URL is not an image");
  if (length > 12 * 1024 * 1024) throw new Error("Product image is too large to analyze");
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  console.log("  [5] Raw buffer size:                ", `${(buffer.length / 1024).toFixed(1)} KB`);
  if (buffer.length > 12 * 1024 * 1024) throw new Error("Product image is too large to analyze");
  return { buffer, mimeType };
}

// Mirrors the CURRENT controller logic: resize to 1200px AND re-encode any
// MIME Gemini does not accept (gif/avif/bmp/tiff/svg…) to JPEG.
const GEMINI_SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

async function normalizeImageBuffer(buffer, mimeType) {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 64 * 1024 * 1024 }).metadata();
    const origMime = String(mimeType || "").toLowerCase().split(";")[0].trim();
    console.log(
      "  [6] Dimensions (pre-normalize):       ",
      `${metadata.width} x ${metadata.height}`,
      `· format=${metadata.format} · header-mime=${origMime}`,
    );
    if (metadata.width && metadata.width > MAX_ANALYSIS_WIDTH) {
      const outMime = origMime === "image/png" ? "image/png" : "image/jpeg";
      buffer = await sharp(buffer, { limitInputPixels: 64 * 1024 * 1024 })
        .resize({ width: MAX_ANALYSIS_WIDTH, withoutEnlargement: true })
        .toFormat(outMime === "image/png" ? "png" : "jpeg", outMime === "image/png" ? {} : { quality: 90 })
        .toBuffer();
      console.log(
        "  [7] Normalization:                    resized to 1200px wide →",
        outMime,
        `(${(buffer.length / 1024).toFixed(1)} KB)`,
      );
      return { buffer, mimeType: outMime };
    }
    if (!GEMINI_SUPPORTED_MIME.has(origMime)) {
      buffer = await sharp(buffer, { limitInputPixels: 64 * 1024 * 1024 })
        .flatten({ background: "#FFFFFF" })
        .jpeg({ quality: 90 })
        .toBuffer();
      console.log(
        "  [7] Normalization:                    unsupported MIME",
        origMime,
        "→ re-encoded to image/jpeg",
        `(${(buffer.length / 1024).toFixed(1)} KB)`,
      );
      return { buffer, mimeType: "image/jpeg" };
    }
    console.log("  [7] Normalization:                    not needed (width <= 1200, supported MIME)");
    return { buffer, mimeType };
  } catch (err) {
    console.warn("  [7] Normalization FAILED:", err?.message || err, "→ analyzing original (unchanged MIME!)");
    return { buffer, mimeType };
  }
}

function safeParse(raw, sourceImage) {
  if (!raw) return null;
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const base = {
    sourceImage: typeof sourceImage === "string" ? sourceImage.slice(0, 1000) : null,
    detectedAt: new Date().toISOString(),
    renderVersion: "v2",
  };
  if (obj.customizable !== true) {
    return { ...base, customizable: false, textLayer: null, textLayers: null, printableArea: null };
  }
  return {
    ...base,
    customizable: true,
    sampleText: typeof obj.sampleText === "string" ? obj.sampleText.slice(0, 80) : undefined,
    printableArea: obj.printableArea || null,
    textLayer: obj.textLayer || null,
    textLayers: obj.textLayers || null,
  };
}

// Realistic Gemini JSON for a mug with one sample name — mirrors the ANALYSIS_PROMPT schema.
const SAMPLE_GEMINI_RAW = `{"customizable": true, "sampleText": "ALI", "printableArea": {"x": 0.08, "y": 0.08, "width": 0.84, "height": 0.84}, "textLayer": {"x": 0.5, "y": 0.55, "width": 0.4, "height": 0.12, "rotation": 0, "fontFamily": "sans", "fontSize": 48, "fontWeight": 700, "color": "#FFFFFF", "stroke": false, "shadow": true, "align": "center", "lineSpacing": 1.2}, "textLayers": null, "perspective": null, "confidence": 0.92, "surfaceType": "ceramic", "lightingDirection": "top-left", "fabricType": null, "textureType": "glossy", "blendMode": "multiply"}`;

async function main() {
  console.log("\n═══ FORENSIC PROBE — Analyze Print Layout (pre-Gemini stages) ═══\n");
  console.log("  [1] Incoming image URL:              ", url);

  const unsafe = isUnsafeImageUrl(url);
  console.log("  [SSRF guard] isUnsafeImageUrl:        ", unsafe ? "UNSAFE — request would be rejected (400)" : "safe (public https)");
  if (unsafe) {
    console.log("\n❌ STAGE FAILED: isUnsafeImageUrl() in printLayoutController.js — a valid public https product image URL is required (status 400).");
    process.exit(1);
  }

  let buffer, mimeType;
  try {
    ({ buffer, mimeType } = await fetchImageBuffer(url));
  } catch (fetchErr) {
    console.error("\n❌ STAGE FAILED: fetchImageBuffer() in printLayoutController.js —", fetchErr?.message || fetchErr, "(status 502)");
    process.exit(1);
  }

  ({ buffer, mimeType } = await normalizeImageBuffer(buffer, mimeType));

  const supported = GEMINI_SUPPORTED_MIME.has(mimeType.toLowerCase().split(";")[0].trim());
  console.log("  [8] MIME passed to Gemini:           ", mimeType, supported ? "✓ supported" : "✗ UNSUPPORTED → Gemini will reject with 400");
  if (!supported) {
    console.log(
      "\n❌ STAGE FAILED: unsupported MIME would be sent to Gemini via inlineData —",
      "Gemini supports jpeg/png/webp/heic/heif only. normalizeImageBuffer() leaves the original",
      "MIME intact on failure, so the request would 400 and the pipeline returns",
      "\"AI could not detect a print layout for this image\" (502).",
    );
  }
  console.log("  [payload] Base64 size for inlineData: ", `${Math.ceil(buffer.length * 1.34) / 1024} KB (base64)`);

  console.log("\n── safeParse() verification (stage 8) ──");
  const layout = safeParse(SAMPLE_GEMINI_RAW, url);
  console.log("  Parsed JSON:                          ", layout ? "✓ valid layout object" : "✗ null — raw response was not parseable");
  if (layout) {
    console.log("  customizable:                         ", layout.customizable);
    console.log("  sampleText:                           ", layout.sampleText);
    console.log("  textLayer (x,y,fontSize):             ", layout.textLayer ? `${layout.textLayer.x}, ${layout.textLayer.y}, ${layout.textLayer.fontSize}` : null);
    console.log("  sourceImage (stale guard):            ", layout.sourceImage);
    console.log("  renderVersion:                        ", layout.renderVersion);
  }
  console.log("\n═══ PROBE COMPLETE — Gemini stage requires a live API call (not made here) ═══\n");
}

main().catch((err) => {
  console.error("[Probe] fatal:", err?.message || err);
  process.exit(1);
});
