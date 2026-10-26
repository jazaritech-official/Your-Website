import { createHash } from "node:crypto";
import sharp from "sharp";
import { createSuccess } from "../utils/commonFunctions.js";
import {
  generateWithFallback,
  GEMINI_CONFIG,
} from "../utils/geminiConfig.js";
import { debugLog } from "../utils/debugLog.js";
import { safeGet, safeSet } from "../utils/redisCache.js";

/* ============================================================
   PRINT LAYOUT DETECTION (ADMIN ONLY)
   ------------------------------------------------------------
   Runs Gemini Vision exactly ONCE per product image — when the
   ADMIN triggers it from the product editor. The returned layout
   is saved with the product (existing updateProduct flow) and is
   NEVER regenerated at customer runtime. The customer preview
   renders purely from the stored layout (no AI, no quota).
   ============================================================ */

const ANALYSIS_PROMPT = [
  `You are an expert print-shop technician inspecting a product photo for a print-on-demand store.`,
  `Your ONLY job: find the sample/placeholder text already PRINTED on the product (for example "ALI", "Your Name", "Name Here", "Muhammad", "Sample", "MUHAMMAD ALI") and describe exactly where and how it sits, so that sample text can later be replaced with a customer's name while every other pixel stays identical.`,
  `Reply with STRICT JSON only — no markdown, no code fences, no commentary. Schema:`,
  `{`,
  `  "customizable": true,`,
  `  "sampleText": "the exact printed text you can read",`,
  `  "printableArea": { "x": 0.18, "y": 0.3, "width": 0.64, "height": 0.4 },`,
  `  "textLayer": {`,
  `    "x": 0.5,`,
  `    "y": 0.55,`,
  `    "width": 0.4,`,
  `    "height": 0.12,`,
  `    "rotation": 0,`,
  `    "skewX": 0,`,
  `    "skewY": 0,`,
  `    "fontFamily": "sans",`,
  `    "fontSize": 48,`,
  `    "fontWeight": 700,`,
  `    "color": "#FFFFFF",`,
  `    "stroke": false,`,
  `    "strokeColor": "#222831",`,
  `    "shadow": true,`,
  `    "align": "center",`,
  `    "lineSpacing": 1.2`,
  `  },`,
  `  "textLayers": [ { same shape as textLayer, one entry per distinct printable text } ],`,
  `  "perspective": { "tl": {"x":0.42,"y":0.5}, "tr": {"x":0.78,"y":0.52}, "br": {"x":0.76,"y":0.68}, "bl": {"x":0.4,"y":0.66} },`,
  `  "confidence": 0.92,`,
  `  "surfaceType": "fabric",`,
  `  "lightingDirection": "top-left",`,
  `  "fabricType": "cotton",`,
  `  "textureType": "woven",`,
  `  "blendMode": "multiply"`,
  `}`,
  `Rules:`,
  `- COMPACTNESS (critical): round every coordinate/fraction to at most 3 decimal places (e.g. 0.5, 0.125, 0.83 — never long decimals). Output ONLY the fields shown in the schema — never invent extra keys, labels or commentary. Keeping the JSON small prevents it from being cut off.`,
  `- customizable: true ONLY if this product can be personalized (it has printed sample/placeholder text, OR it is a BLANK product whose surface clearly supports printing). Otherwise set customizable=false and omit printableArea/textLayer/textLayers.`,
  `- BLANK PRODUCTS (no printed text, e.g. a plain mug, shirt, keychain, frame or pop socket): set customizable=true, printableArea=the centered region where a name could be printed (away from edges/handles), textLayer=null, textLayers=null. The server will generate a default centered text layer.`,
  `- printableArea is the TIGHT bounding box of the ACTUAL print zone on the product — the region where the printed design visibly sits (or the designated print area), NOT a loose area covering most of the surface. It must hug the design closely: correct aspect ratio, correct size relative to the garment, correct position. The schema example above shows a t-shirt CHEST print zone; every product gets its own tight, product-specific zone (mug: wrap band centered on the body away from handle/rim; keychain: the face plate; frame: the inner mat; shirt: chest/back print bounded below the collar and above the hem). NEVER return a printableArea wider than ~0.75 of the product surface.`,
  `- PHOTO / IMAGE PRINTS: when the product carries a printed PHOTO, picture, portrait, graphic or design block (not just text), describe printableArea as the tight rectangle that EXACTLY bounds that printed design block, preserving its real aspect ratio (a portrait photo print is taller than wide; a wide chest graphic is wider than tall). The customer's uploaded photo will be placed to fill exactly this zone — a loose or wrong-aspect zone makes the photo look pasted on. For photo prints set textLayer to null UNLESS there is also separate printed text.`,
  `- Distinguish photo prints from text: if the printed element is a PHOTO/GRAPHIC (contains people, objects, landscapes, patterns or a picture-like design), it is an image print, NOT a text layer — never describe it as textLayer. textLayer/textLayers are ONLY for actual text characters.`,
  `- Ignore logos, watermarks, brand marks, price tags and label stickers.`,
  `- textLayer = the LARGEST / primary printed text. textLayers = EVERY distinct printable text box, each with the SAME schema as textLayer. If only one text exists, textLayers may be omitted.`,
  `- ALL coordinates are normalized fractions of the FULL image (0..1).`,
  `- printableArea: x/y is its TOP-LEFT corner, width/height its size, all normalized fractions of the FULL image (0..1). It must be the TIGHT bounding box of the actual print zone (see the tightness rule above), inside the product surface and away from edges/handles.`,
  `- textLayer.x / textLayer.y: the CENTER of the text bounding box (0..1).`,
  `- textLayer.width / height: bounding box size (0..1); width >= 0.02, height >= 0.004.`,
  `- rotation: degrees, positive = clockwise (usually between -12 and 12).`,
  `- skewX / skewY: OPTIONAL skew in degrees (usually 0) — only for clearly slanted print, e.g. text running up a curved mug. Omit or set 0 otherwise.`,
  `- fontSize: approximate height of capital letters in ORIGINAL image pixels (source image is normalized to at most 1200px wide).`,
  `- fontFamily: "sans", "serif" or "script" (script = cursive/calligraphy).`,
  `- fontWeight: 400 (regular), 600 (semibold) or 800 (bold).`,
  `- color / strokeColor: hex colors (#RRGGBB) of the printed letters.`,
  `- shadow: true if the letters have a drop shadow or outline for contrast against the product.`,
  `- align: "center", "left" or "right" relative to the product surface.`,
  `- lineSpacing: line-height multiplier (1.0 = single).`,
  `- perspective: OPTIONAL — include ONLY when the print surface is clearly angled or warped in the photo. Four normalized corners of the text region: tl=top-left, tr=top-right, br=bottom-right, bl=bottom-left. Omit when the surface is roughly front-facing.`,
  `- confidence: OPTIONAL number 0..1 — how sure you are the sample text was located correctly.`,
  `- surfaceType: OPTIONAL one of "fabric" | "ceramic" | "plastic" | "metal" | "paper" | "glass" | "leather" | "rubber" | "wood" | null.`,
  `- lightingDirection: OPTIONAL one of "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right" | "flat" | null.`,
  `- fabricType: OPTIONAL e.g. "cotton", "polyester", "canvas", "silk", "linen", "fleece", "denim", "knit", null.`,
  `- textureType: OPTIONAL one of "woven" | "grain" | "smooth" | "glossy" | "matte" | "leather" | null.`,
  `- blendMode: OPTIONAL one of "multiply" | "screen" | "overlay" | null — the best ink blend for this surface.`,
].join("\n");

/** Reject non-https URLs and private/loopback/link-local hosts (SSRF guard). */
function isUnsafeImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) {
      return true;
    }
    if (
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
    ) {
      return true;
    }
    if (host.startsWith("[::") || host === "::1" || host === "::") return true;
    return false;
  } catch {
    return true;
  }
}

const clampNum = (v, min, max, dflt) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : dflt;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const SURFACE_TYPES = new Set(["fabric", "ceramic", "plastic", "metal", "paper", "glass", "leather", "rubber", "wood"]);
const LIGHT_DIRS = new Set(["top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right", "flat"]);
const TEXTURE_TYPES = new Set(["woven", "grain", "smooth", "glossy", "matte", "leather"]);
const BLEND_MODES = new Set(["multiply", "screen", "overlay"]);
const FABRIC_TYPES = new Set(["cotton", "polyester", "canvas", "silk", "linen", "fleece", "denim", "knit"]);

const pickFromSet = (v, set) => (typeof v === "string" && set.has(v) ? v : null);

/** Parse (and clamp) ONE printable text region. Returns null when unusable. */
function parseLayer(rawTl) {
  if (!rawTl || typeof rawTl !== "object") return null;
  const family = rawTl.fontFamily;
  const align = rawTl.align;
  const color =
    typeof rawTl.color === "string" && HEX_COLOR.test(rawTl.color.trim())
      ? rawTl.color.trim()
      : "#FFFFFF";
  const strokeColor =
    typeof rawTl.strokeColor === "string" && HEX_COLOR.test(rawTl.strokeColor.trim())
      ? rawTl.strokeColor.trim()
      : undefined;
  const skewX = Number(rawTl.skewX);
  const skewY = Number(rawTl.skewY);
  return {
    x: clampNum(rawTl.x, 0, 1, 0.5),
    y: clampNum(rawTl.y, 0, 1, 0.5),
    width: clampNum(rawTl.width, 0.02, 0.95, 0.4),
    height: clampNum(rawTl.height, 0.004, 0.9, 0.12),
    rotation: clampNum(rawTl.rotation, -45, 45, 0),
    skewX: Number.isFinite(skewX) ? Math.min(30, Math.max(-30, skewX)) : 0,
    skewY: Number.isFinite(skewY) ? Math.min(30, Math.max(-30, skewY)) : 0,
    fontFamily: family === "serif" || family === "script" ? family : "sans",
    fontSize: clampNum(rawTl.fontSize, 8, 600, 48),
    fontWeight: [400, 600, 800].includes(rawTl.fontWeight) ? rawTl.fontWeight : 600,
    color,
    stroke: rawTl.stroke === true,
    strokeColor,
    shadow: rawTl.shadow === true,
    align: align === "left" || align === "right" ? align : "center",
    lineSpacing: clampNum(rawTl.lineSpacing, 0.8, 3, 1.2),
  };
}

/** Parse the OPTIONAL perspective quad (normalized corners). Rejects degenerate quads. */
function parsePerspective(p) {
  if (!p || typeof p !== "object") return null;
  const out = {};
  for (const corner of ["tl", "tr", "br", "bl"]) {
    const pt = p[corner];
    if (!pt || typeof pt !== "object") return null;
    out[corner] = {
      x: clampNum(pt.x, 0, 1, 0.5),
      y: clampNum(pt.y, 0, 1, 0.5),
    };
  }
  const area =
    Math.abs(
      out.tl.x * (out.tr.y - out.bl.y) +
        out.tr.x * (out.br.y - out.tl.y) +
        out.br.x * (out.bl.y - out.tr.y) +
        out.bl.x * (out.tl.y - out.br.y)
    ) / 2;
  if (area < 0.005) return null; // near-zero area → skip perspective entirely
  return out;
}

/**
 * BLANK PRODUCT support: printableArea without any printed text gets a
 * synthesized centered default layer so the preview NEVER shows "unavailable"
 * for a personalizable product.
 */
function defaultTextLayer(pa) {
  return {
    x: pa.x + pa.width / 2,
    y: pa.y + pa.height / 2,
    width: Math.min(0.6, Math.max(0.1, pa.width * 0.85)),
    height: Math.min(0.12, Math.max(0.02, pa.height * 0.25)),
    rotation: 0,
    skewX: 0,
    skewY: 0,
    fontFamily: "sans",
    fontSize: 48,
    fontWeight: 700,
    color: "#FFFFFF",
    stroke: true,
    strokeColor: "#222831",
    shadow: true,
    align: "center",
    lineSpacing: 1.2,
    isDefault: true,
  };
}

/**
 * Best-effort repair of a JSON string truncated mid-value (finishReason
 * MAX_TOKENS): cut back to the last complete member, re-close the open
 * braces/brackets (tracked on a stack), and retry JSON.parse. Defense-in-depth
 * ONLY — the real fix is the raised maxOutputTokens. Returns null when no
 * candidate parses.
 */
function repairTruncatedJson(raw, start) {
  const body = raw.slice(start);
  // Candidate cut points: the full body, plus one position per completed
  // member (a truncation usually cuts a member's VALUE short, e.g. "y": 0.).
  const cutPoints = new Set([body.length]);
  let inString = false;
  let escaped = false;
  let depth = 0;
  let stringStart = -1;
  let lastComma = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringStart = i;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === ",") {
      lastComma = i;
      if (depth >= 1) cutPoints.add(i);
    }
  }
  // Text ends INSIDE a string → that member's value is incomplete: cut at the
  // previous comma, or at the string start when it is the first member.
  if (inString && stringStart >= 0) {
    cutPoints.add(
      lastComma > -1 && lastComma < stringStart ? lastComma : stringStart
    );
  }
  if (lastComma > -1) cutPoints.add(lastComma);

  const closingFor = (open) => (open === "{" ? "}" : "]");
  const candidates = [...cutPoints].sort((a, b) => b - a).slice(0, 8);
  for (const cut of candidates) {
    const prefix = body.slice(0, cut).trim();
    if (!prefix) continue;
    const stack = [];
    let inS = false;
    let esc = false;
    for (const ch of prefix) {
      if (inS) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inS = false;
        continue;
      }
      if (ch === '"') {
        inS = true;
        continue;
      }
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
    const closing = stack.reverse().map(closingFor).join("");
    try {
      return JSON.parse(prefix + closing);
    } catch {
      /* try the next cut point */
    }
  }
  return null;
}

function safeParse(raw, sourceImage, finishReason) {
  if (!raw) return null;
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let obj;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    // Truncation safety net: when the model hit its output limit mid-JSON
    // (finishReason "MAX_TOKENS"), try to rescue the last complete structure.
    if (finishReason === "MAX_TOKENS") {
      const repaired = repairTruncatedJson(cleaned, start);
      if (repaired) {
        debugLog(
          "[PrintLayout] [9] JSON truncated (finishReason=MAX_TOKENS) — repaired via brace-balance fallback",
        );
        obj = repaired;
      } else {
        console.warn(
          "[PrintLayout] [9] JSON truncated (finishReason=MAX_TOKENS) but repair failed — returning the safe error path",
        );
        return null;
      }
    } else {
      return null;
    }
  }

  // Metadata shared by every layout variant — drives stale-layout invalidation
  // on the frontend (sourceImage) and the order snapshot (renderVersion).
  const base = {
    sourceImage: typeof sourceImage === "string" ? sourceImage.slice(0, 1000) : null,
    detectedAt: new Date().toISOString(),
    renderVersion: "v2",
  };

  if (obj.customizable !== true) {
    return {
      ...base,
      customizable: false,
      textLayer: null,
      textLayers: null,
      printableArea: null,
    };
  }

  const pa =
    obj.printableArea && typeof obj.printableArea === "object"
      ? obj.printableArea
      : null;

  // Parse EVERY printable region — primary first, then the array.
  const layers = [];
  const primary = parseLayer(obj.textLayer);
  if (primary) layers.push(primary);
  if (Array.isArray(obj.textLayers)) {
    for (const rawTl of obj.textLayers) {
      const layer = parseLayer(rawTl);
      if (layer) layers.push(layer);
    }
  }
  // Deduplicate exact duplicates (Gemini occasionally echoes the primary).
  const seen = new Set();
  const textLayers = layers.filter((l) => {
    const key = `${l.x}|${l.y}|${l.width}|${l.height}|${l.rotation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const printableArea = pa
    ? {
        x: clampNum(pa.x, 0, 0.98, 0.08),
        y: clampNum(pa.y, 0, 0.98, 0.08),
        width: clampNum(pa.width, 0.02, 1, 0.84),
        height: clampNum(pa.height, 0.02, 1, 0.84),
      }
    : null;

  // BLANK PRODUCT: printable surface, no printed text → synthesize the default
  // centered layer (marked isDefault so the frontend can label it if needed).
  if (printableArea && !textLayers.length) {
    textLayers.push(defaultTextLayer(printableArea));
  }
  if (!printableArea && !textLayers.length) {
    return {
      ...base,
      customizable: false,
      textLayer: null,
      textLayers: null,
      printableArea: null,
    };
  }

  return {
    ...base,
    customizable: true,
    sampleText:
      typeof obj.sampleText === "string" ? obj.sampleText.slice(0, 80) : undefined,
    printableArea,
    // textLayer stays the PRIMARY region so the legacy single-layer contract
    // and every existing consumer keep working unchanged.
    textLayer: textLayers[0],
    textLayers,
    // ── OPTIONAL premium metadata (all nullable, never break old layouts) ──
    perspective: parsePerspective(obj.perspective),
    confidence: clampNum(obj.confidence, 0, 1, null),
    surfaceType: pickFromSet(obj.surfaceType, SURFACE_TYPES),
    lightingDirection: pickFromSet(obj.lightingDirection, LIGHT_DIRS),
    fabricType: pickFromSet(obj.fabricType, FABRIC_TYPES),
    textureType: pickFromSet(obj.textureType, TEXTURE_TYPES),
    blendMode: pickFromSet(obj.blendMode, BLEND_MODES),
  };
}

/* ── Shared core: fetch the image and run Gemini Vision ──────
   Used by BOTH the admin endpoint and the backfill script so the
   prompt / clamping / model-fallback logic lives in one place. */

/* ── IMAGE NORMALIZATION ───────────────────────────────────────
   The customer renderer composites at max 1200px wide. Normalizing the
   image BEFORE Gemini sees it puts both sides on the SAME calibration, so
   Gemini's pixel estimates (fontSize, box size) match the client canvas
   exactly. Wide images are resized down (aspect preserved, 90% JPEG);
   PNGs keep their alpha channel. Any failure analyzes the original.
   Never throws. */
const MAX_ANALYSIS_WIDTH = 1200;

// Gemini Vision accepts ONLY these inline MIME types. Anything else
// (gif, avif, bmp, tiff, svg, ico…) is re-encoded to JPEG below so the
// vision call can never 400 on an unsupported content type.
const GEMINI_SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

async function normalizeImageBuffer(buffer, mimeType) {
  try {
    const metadata = await sharp(buffer, {
      limitInputPixels: 64 * 1024 * 1024,
    }).metadata();
    const origMime = String(mimeType || "").toLowerCase().split(";")[0].trim();

    // Same 1200px-wide calibration the customer renderer uses.
    const origWidth = metadata.width ?? null;
    const origHeight = metadata.height ?? null;
    if (metadata.width && metadata.width > MAX_ANALYSIS_WIDTH) {
      const outMime = origMime === "image/png" ? "image/png" : "image/jpeg";
      buffer = await sharp(buffer, {
        limitInputPixels: 64 * 1024 * 1024,
      })
        .resize({ width: MAX_ANALYSIS_WIDTH, withoutEnlargement: true })
        .toFormat(
          outMime === "image/png" ? "png" : "jpeg",
          outMime === "image/png" ? {} : { quality: 90 }
        )
        .toBuffer();
      return { buffer, mimeType: outMime, width: origWidth, height: origHeight };
    }

    // Width is fine, but Gemini still rejects unsupported MIME types —
    // re-encode (gif/avif/bmp/tiff/svg originals) to JPEG before the call.
    if (!GEMINI_SUPPORTED_MIME.has(origMime)) {
      buffer = await sharp(buffer, {
        limitInputPixels: 64 * 1024 * 1024,
      })
        .flatten({ background: "#FFFFFF" })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { buffer, mimeType: "image/jpeg", width: origWidth, height: origHeight };
    }

    return { buffer, mimeType, width: origWidth, height: origHeight };
  } catch (err) {
    console.warn(
      "[PrintLayout] image normalization failed — analyzing original:",
      err?.message || err
    );
    return { buffer, mimeType, width: null, height: null };
  }
}

async function fetchImageBuffer(imageUrl) {
  const imgRes = await fetch(imageUrl);
  debugLog("[PrintLayout] [3] HTTP status while downloading:", imgRes.status, imgRes.statusText);
  if (!imgRes.ok) throw new Error("Could not fetch the product image");
  const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
  debugLog("[PrintLayout] [4] Image MIME type:", mimeType);
  if (!mimeType.startsWith("image/")) {
    throw new Error("The product image URL is not an image");
  }
  const length = Number(imgRes.headers.get("content-length") || 0);
  if (length > 12 * 1024 * 1024) {
    throw new Error("Product image is too large to analyze");
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error("Product image is too large to analyze");
  }
  return { buffer, mimeType };
}

/* ── Redis-backed result cache (24h TTL) ─────────────────────
   Re-running Gemini for the same product image repeatedly wastes
   quota. Cache the detected layout keyed by an MD5 hash of the
   image URL for 24 hours in Redis — survives cold starts and
   works across serverless instances. Falls back to no-cache if
   Redis is unavailable (best-effort, never blocks the request). */
const LAYOUT_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function cacheKeyForImageUrl(imageUrl) {
  return `printlayout:${createHash("md5").update(imageUrl).digest("hex")}`;
}

async function getCachedLayout(imageUrl) {
  const key = cacheKeyForImageUrl(imageUrl);
  try {
    const cached = await safeGet(key);
    return cached || null;
  } catch {
    return null;
  }
}

async function setCachedLayout(imageUrl, layout) {
  const key = cacheKeyForImageUrl(imageUrl);
  try {
    await safeSet(key, layout, LAYOUT_CACHE_TTL_SECONDS);
  } catch {
    // Best-effort — cache write failure must not block the response
  }
}

/** Detect (and clamp) the print layout for a public product image URL.
    `force` bypasses the 24h cache so the ADMIN can re-analyze the same image
    (e.g. after a prompt/model improvement) without waiting for expiry. */
export async function detectPrintLayoutFromImageUrl(imageUrl, force = false) {
  if (!imageUrl || typeof imageUrl !== "string" || isUnsafeImageUrl(imageUrl)) {
    return {
      error: "A valid public https product image URL is required",
      status: 400,
      errorCode: "INVALID_IMAGE_URL",
      stage: "validate",
    };
  }

  // Whole-pipeline clock — reported in every [PrintLayout][FAIL] payload.
  const detectStartedAt = Date.now();

  // Return the cached result for the same image analyzed in the last 24h —
  // UNLESS the admin explicitly forced a fresh analysis.
  if (!force) {
    const cached = await getCachedLayout(imageUrl);
    if (cached) {
      return { layout: JSON.parse(JSON.stringify(cached)) };
    }
  }

  let buffer;
  let mimeType;
  try {
    ({ buffer, mimeType } = await fetchImageBuffer(imageUrl));
  } catch (fetchErr) {
    // STRUCTURED failure — the exact stage is recorded so production logs can
    // distinguish an image-download problem from a Gemini problem.
    console.error(
      "[PrintLayout][FAIL] " +
        JSON.stringify({
          stage: "fetch",
          status: 502,
          errorCode: "IMAGE_FETCH_FAILED",
          errorMessage: fetchErr?.message || "Could not fetch the product image",
          imageMime: null,
          imageSize: null,
          imageWidth: null,
          imageHeight: null,
          durationMs: Date.now() - detectStartedAt,
          ts: new Date().toISOString(),
        })
    );
    return {
      error: fetchErr?.message || "Could not fetch the product image",
      status: 502,
      errorCode: "IMAGE_FETCH_FAILED",
      stage: "fetch",
    };
  }

  // Normalize to the SAME 1200px calibration the customer renderer uses so
  // Gemini's pixel estimates match the client canvas (deterministic per URL,
  // so the URL-keyed cache stays valid).
  const normalized = await normalizeImageBuffer(buffer, mimeType);
  buffer = normalized.buffer;
  mimeType = normalized.mimeType;
  const imgWidth = normalized.width;
  const imgHeight = normalized.height;
  const imgSizeBytes = buffer.length;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(
      "[PrintLayout][FAIL] " +
        JSON.stringify({
          stage: "env",
          status: 500,
          errorCode: "AI_NOT_CONFIGURED",
          errorMessage: "Gemini API key is not configured",
          ts: new Date().toISOString(),
        })
    );
    return { error: "Gemini API key is not configured", status: 500, errorCode: "AI_NOT_CONFIGURED", stage: "env" };
  }

  const imageBase64 = buffer.toString("base64");

  // Vision analysis via the CENTRALIZED Gemini client (utils/geminiConfig.js):
  // primary model first, configured fallback on 404 / quota / transient
  // failures. Only standardized errors surface — never raw Gemini output.
  let layout = null;
  let usedModel = null;
  let finishReason = null;
  try {
    const result = await generateWithFallback({
      contents: [
        { text: ANALYSIS_PROMPT },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
      generationConfig: {
        temperature: 0.1,
        // 4096 tokens: production logs proved 1200 still truncates the full
        // layout JSON (textLayer + textLayers + perspective + premium
        // metadata) mid-value → safeParse() returns null → false 502. 4096
        // leaves generous headroom, and the finishReason log + brace-balance
        // repair below are the safety net if it ever cuts off again.
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
      // 50s per model attempt: typical vision success is 15–25s, so a single
      // attempt (and usually even the primary-503 → fallback path) completes
      // within the 60s Vercel Hobby function budget. maxDuration in
      // vercel.json gives Pro deployments full headroom.
      timeoutMs: 50_000,
    });
    usedModel = result.model;
    finishReason = result.finishReason || null;
    layout = safeParse(result.text, imageUrl, finishReason);
  } catch (modelErr) {
    // STRUCTURED FAILURE — the single source of truth for what went wrong.
    // Never logs keys, tokens, cookies or the raw Gemini payload.
    const fail = {
      stage: "gemini",
      model: usedModel || GEMINI_CONFIG.primary,
      fallbackModel: GEMINI_CONFIG.fallback,
      status: modelErr?.status || 502,
      errorMessage: modelErr?.message || "AI call failed",
      errorCode: modelErr?.code || "AI_UNAVAILABLE",
      imageMime: mimeType,
      imageSize: imgSizeBytes,
      imageWidth: imgWidth,
      imageHeight: imgHeight,
      durationMs: Date.now() - detectStartedAt,
      ts: new Date().toISOString(),
    };
    console.error("[PrintLayout][FAIL] " + JSON.stringify(fail));
    return {
      error: "Print layout AI analysis failed",
      status: fail.status,
      errorCode: fail.errorCode,
      stage: fail.stage,
    };
  }

  if (!layout) {
    // Valid Gemini response but the JSON could not be parsed into a usable
    // layout (e.g. truncated/empty output). Distinct code so the frontend
    // can tell "model failed" from "model answered but output was unusable".
    console.error(
      "[PrintLayout][FAIL] " +
        JSON.stringify({
          stage: "parse",
          model: usedModel || GEMINI_CONFIG.primary,
          fallbackModel: GEMINI_CONFIG.fallback,
          finishReason,
          status: 502,
          errorMessage: "Gemini response could not be parsed into a valid print layout",
          errorCode: "LAYOUT_PARSE_FAILED",
          imageMime: mimeType,
          imageSize: imgSizeBytes,
          imageWidth: imgWidth,
          imageHeight: imgHeight,
          durationMs: Date.now() - detectStartedAt,
          ts: new Date().toISOString(),
        })
    );
    return {
      error: "Print layout AI analysis failed",
      status: 502,
      errorCode: "LAYOUT_PARSE_FAILED",
      stage: "parse",
    };
  }
  await setCachedLayout(imageUrl, layout);
  return { layout };
}

export const analyzePrintLayout = async (req, res, next) => {
  try {
    const { imageUrl, force } = req.body;
    const result = await detectPrintLayoutFromImageUrl(imageUrl, force === true);
    if (result.error) {
      // SAFE structured error for the API response — the exact stage/code is
      // forwarded (never raw Gemini text or keys) so the admin console can
      // distinguish: 404 invalid model · 400 unsupported input · 429 quota ·
      // 503 high demand · timeout · unparseable JSON · fetch/normalize failure.
      console.error(
        "[PrintLayout] ✗ endpoint failed:",
        result.status,
        result.errorCode || "",
        result.stage || "",
        result.error,
      );
      // Client-side failures (400 validation) forward their real message;
      // server/AI failures (5xx) always use the safe generic one.
      const status = result.status || 400;
      return res.status(status).json({
        success: false,
        status,
        message:
          status < 500 ? result.error : "Print layout AI analysis failed",
        errorCode: result.errorCode || "PRINT_LAYOUT_FAILED",
        stage: result.stage || "pipeline",
      });
    }
    return res.status(200).json(
      createSuccess(200, "Print layout detected", result.layout),
    );
  } catch (error) {
    console.error(
      "[PrintLayout][FAIL] " +
        JSON.stringify({
          stage: "endpoint",
          status: 502,
          errorMessage: error?.message || "Unexpected endpoint error",
          errorCode: "PRINT_LAYOUT_UNEXPECTED",
          ts: new Date().toISOString(),
        })
    );
    return res.status(502).json({
      success: false,
      status: 502,
      message: "Print layout AI analysis failed",
      errorCode: "PRINT_LAYOUT_UNEXPECTED",
      stage: "endpoint",
    });
  }
};
