/**
 * Client-side image compression using the HTML5 Canvas API.
 *
 * Normalizes EVERY uploaded product image to a consistent, bounded size.
 * This serves two purposes:
 *   1. Prevents Vercel 413 errors (request body > ~4.5MB)
 *   2. Protects Cloudinary storage budget (free tier: 5GB total)
 *
 * Every image is re-encoded through Canvas with a fixed max dimension and
 * quality ceiling, producing predictable output sizes regardless of input.
 * No external dependencies — uses only browser built-in Canvas and Blob APIs.
 */

// ── Image Quality Profiles ─────────────────────────────────────────
// Two-tier compression: the primary/cover image (index 0) gets higher
// quality because it's the hero image customers see first AND the image
// fed to AI print-layout detection. Secondary gallery images use a
// more storage-conservative profile.
//
// Both profiles still protect the Cloudinary free tier (5GB).
// Tuning: adjust these constants — no code changes needed elsewhere.
interface ImageProfile {
  maxDimension: number;
  jpegQuality: number;
  /** Approximate file-size ceiling in bytes (for the retry guard). */
  targetBytes: number;
}

/** Primary/cover image — sharper for hero display + AI detection accuracy. */
const PRIMARY_IMAGE_PROFILE: ImageProfile = {
  maxDimension: 2400,
  jpegQuality: 0.90,
  targetBytes: 3.8 * 1024 * 1024, // ~900KB typical, 3.8MB hard cap
};

/** Secondary gallery images — storage-conscious, still high quality. */
const SECONDARY_IMAGE_PROFILE: ImageProfile = {
  maxDimension: 2000,
  jpegQuality: 0.85,
  targetBytes: 3.5 * 1024 * 1024, // ~600KB typical, 3.5MB hard cap
};

const OUTPUT_TYPE = "image/jpeg";
const MAX_RETRIES = 2; // progressive quality reduction passes

interface CompressResult {
  file: File;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
}

/**
 * Check if the browser can decode the given file type as an image.
 * HEIC/HEIF may or may not be supported depending on the browser/OS.
 */
function canDecodeImage(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

/**
 * Compress/normalize a single image file.
 *
 * EVERY file is processed through Canvas to produce a consistent, bounded
 * output — even already-small images are re-encoded to JPEG at the
 * configured quality for format consistency. This ensures:
 *   - Predictable Cloudinary storage usage (~500KB per image)
 *   - No Vercel 413 errors (output always well under 4MB)
 *   - Uniform format (JPEG) regardless of input format
 *
 * Images that end up LARGER after re-encoding (extremely rare — only
 * happens with tiny, already-optimized JPEGs) are returned as-is to
 * avoid wasting storage.
 *
 * @param file - The image file to compress.
 * @param imageIndex - Index in the product's image array (0 = primary/cover).
 *                     Determines which quality profile is used.
 */
export async function compressImage(file: File, imageIndex: number = 0): Promise<CompressResult> {
  const originalSize = file.size;

  // Check if the browser can even decode this image (HEIC on unsupported browsers)
  const canDecode = await canDecodeImage(file);
  if (!canDecode) {
    return { file, compressed: false, originalSize, compressedSize: originalSize };
  }

  try {
    const profile = imageIndex === 0 ? PRIMARY_IMAGE_PROFILE : SECONDARY_IMAGE_PROFILE;
    const compressedBlob = await compressWithCanvas(file, profile);

    // If the re-encoded file is LARGER than the original, don't waste
    // storage — return the original. This only happens with tiny, already-
    // optimized JPEGs that are smaller than what Canvas produces at our
    // quality ceiling.
    if (compressedBlob.size >= originalSize) {
      return { file, compressed: false, originalSize, compressedSize: originalSize };
    }

    // Build a new File from the compressed blob, preserving the original name
    // but with a .jpg extension (since we always output JPEG)
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const compressedFile = new File(
      [compressedBlob],
      `${baseName}.jpg`,
      { type: OUTPUT_TYPE, lastModified: Date.now() },
    );

    return {
      file: compressedFile,
      compressed: true,
      originalSize,
      compressedSize: compressedFile.size,
    };
  } catch {
    // Canvas failed (e.g. corrupt file) — return original and let the
    // upload attempt proceed (the backend will reject if too large)
    return { file, compressed: false, originalSize, compressedSize: originalSize };
  }
}

/**
 * Core Canvas-based compression. Draws the image onto a canvas at reduced
 * dimensions (capping the longest side to MAX_DIMENSION) and exports as
 * JPEG at the configured quality level.
 *
 * If the first pass is still too large, iteratively reduces quality
 * (down to 0.5) until the result fits under the target size.
 */
async function compressWithCanvas(file: File, profile: ImageProfile): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = computeResizeDimensions(img.width, img.height, profile.maxDimension);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  // Draw with high-quality resampling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  // First pass at the profile's quality
  let blob = await canvasToBlob(canvas, OUTPUT_TYPE, profile.jpegQuality);

  // If still too large, progressively reduce quality
  let quality = profile.jpegQuality;
  for (let i = 0; i < MAX_RETRIES && blob.size > profile.targetBytes; i++) {
    quality -= 0.1;
    if (quality < 0.5) quality = 0.5;
    blob = await canvasToBlob(canvas, OUTPUT_TYPE, quality);
  }

  return blob;
}

/**
 * Load an image File into an HTMLImageElement (returns a promise).
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };
    img.src = url;
  });
}

/**
 * Compute new dimensions that fit within MAX_DIMENSION while preserving
 * the original aspect ratio. Images smaller than MAX_DIMENSION are NOT
 * upscaled (only downscaled).
 */
function computeResizeDimensions(
  origW: number,
  origH: number,
  maxDim: number,
): { width: number; height: number } {
  if (origW <= maxDim && origH <= maxDim) {
    return { width: origW, height: origH };
  }
  const ratio = Math.min(maxDim / origW, maxDim / origH);
  return {
    width: Math.round(origW * ratio),
    height: Math.round(origH * ratio),
  };
}

/**
 * Promise wrapper around canvas.toBlob().
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      type,
      quality,
    );
  });
}

/**
 * Check if a file is a HEIC/HEIF image (common iPhone format).
 */
export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif") ||
    file.type === "image/heic" || file.type === "image/heif";
}

/**
 * Get a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
