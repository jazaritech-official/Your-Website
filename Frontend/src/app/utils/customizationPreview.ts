/* ============================================================
   AI LIVE CUSTOM PREVIEW — shared pure helpers
   ------------------------------------------------------------
   Everything here is side-effect free and safe to import from
   any client component. Sanitization, script detection, image
   validation/optimization and Cloudinary transformation URLs.

   Security notes:
   - Text is NEVER rendered as HTML (React text nodes escape),
     and we additionally strip tags/control chars before display,
     persistence and socket relay.
   - SVG uploads are rejected outright (no executable payloads).
   - Image size is capped client-side to match backend limits.
   ============================================================ */

export const MAX_PREVIEW_TEXT_LENGTH = 200;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (mirrors backend)

/** Only raster formats the backend upload pipeline accepts (no SVG). */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const IMAGE_ACCEPT_ATTR = ALLOWED_IMAGE_TYPES.join(",");

/** Same key format the checkout customization form already uses. */
export const getFieldKey = (fieldType: string, label: string) =>
  `${fieldType}|${label}`;

/**
 * Sanitize a customization text value for safe display / storage / relay.
 * React already escapes rendered text, this is defense in depth.
 */
export function sanitizePreviewText(
  value: string,
  maxLen: number = MAX_PREVIEW_TEXT_LENGTH,
): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "") // strip anything that looks like a tag
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // control chars
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/* Arabic / Urdu / Persian / Pashto + presentation forms (for shaping). */
const RTL_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export const detectRTLScript = (text: string): boolean =>
  RTL_REGEX.test(text || "");

/* ── Font stacks ─────────────────────────────────────────────── */
/** Default Latin stack — prefers the app font, falls back to system. */
export const DEFAULT_FONT_STACK =
  '"Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Elegant serif — used when AI suggests a "serif" style. */
export const SERIF_FONT_STACK =
  '"Playfair Display", "Geist", Georgia, "Times New Roman", serif';

/** Script / calligraphy — for names & decorative text. */
export const SCRIPT_FONT_STACK =
  '"Great Vibes", "Brush Script MT", "Segoe Script", cursive';

/** Arabic / Urdu stack — Noto Naskh Arabic is lazy-loaded on demand. */
export const ARABIC_FONT_STACK =
  '"Noto Naskh Arabic", "Amiri", "Scheherazade New", Tahoma, "Segoe UI", sans-serif';

/** Google Fonts stylesheet injected lazily the first time a preview mounts. */
export const PREVIEW_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Great+Vibes&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400&display=swap";

/* ── Image value detection ───────────────────────────────────── */
const IMAGE_URL_EXT = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;

/** Is a stored customization answer an image URL rather than text? */
export function isImageUrlValue(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  if (v.startsWith("blob:") || v.startsWith("data:image/")) return true;
  return (
    /^https?:\/\//i.test(v) &&
    (IMAGE_URL_EXT.test(v) ||
      v.includes("res.cloudinary.com") ||
      v.includes("cloudinary.com"))
  );
}

/* ── File validation ─────────────────────────────────────────── */
export type ImageValidationResult =
  | { ok: true; file: File }
  | { ok: false; error: string };

export function validateImageFile(file: File | null | undefined): ImageValidationResult {
  if (!file) return { ok: false, error: "No file selected" };
  const type = (file.type || "").toLowerCase();

  // Hard-block SVG and anything that could execute.
  if (type === "image/svg+xml" || /\.svg$/i.test(file.name || "")) {
    return {
      ok: false,
      error: "SVG files are not supported for security reasons",
    };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(type)) {
    return {
      ok: false,
      error: "Only PNG, JPG or WEBP images are allowed",
    };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, error: "Image is too large — max 5 MB" };
  }
  return { ok: true, file };
}

/**
 * Downscale & re-encode large JPEG/WEBP uploads client-side to keep
 * Cloudinary payloads lean. PNG (transparency) and GIF (animation) are
 * passed through untouched. Never throws — falls back to the original.
 */
export async function downscaleImageFile(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<File> {
  try {
    const type = (file.type || "").toLowerCase();
    if (type === "image/png" || type === "image/gif") return file;

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    const name = (file.name || "image.jpg").replace(/\.\w+$/, ".jpg");
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // never break the customization flow
  }
}

/**
 * Sample the average luminance (0..1) of an image — used to pick a text
 * color with enough contrast on the product photo. Returns null when the
 * image can't be read (CORS / invalid), callers fall back gracefully.
 */
export function loadAverageLuminance(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 128) continue; // ignore transparent pixels
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          count++;
        }
        resolve(count ? sum / count / 255 : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
