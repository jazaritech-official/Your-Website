"use client";

/* ============================================================
   Client-side AI background removal (zero server AI)
   ------------------------------------------------------------
   Wraps @imgly/background-removal — an ONNX segmentation model
   that runs ENTIRELY in the browser (WebAssembly). The model is
   downloaded once per device and cached by the browser, so the
   customer preview never depends on a live server AI call.

   - Works for blob: object URLs (freshly picked files), Cloudinary
     URLs (cart/order snapshots) and data: URLs alike — nothing is
     excluded because of the URL origin.
   - Results are cached per source URL for the session, so toggling
     the "Remove background" checkbox is instant after the first run.
   - NEVER throws: any failure resolves to the ORIGINAL image so the
     customization flow is never blocked.
   ============================================================ */

export interface RemovalProgress {
  /** Current stage — "fetch" (model download) or "compute" (inference). */
  stage: string;
  /** 0..1 overall progress (0 when unknown). */
  ratio: number;
}

let libraryPromise: Promise<typeof import("@imgly/background-removal")> | null =
  null;

/**
 * Dynamic import keeps the ~1.7 MB library OUT of the main bundle — it is
 * only fetched the first time a customer actually uses the feature, and only
 * ever from the browser (never during SSR).
 */
function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = import("@imgly/background-removal");
  }
  return libraryPromise;
}

/** Completed cutouts — keyed by the source URL, blob URLs live for the page
    session which is exactly the preview lifetime. */
const resolvedCache = new Map<string, string>();
/** In-flight promises so concurrent renders share one inference run. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Remove the background of an image fully client-side. Returns a blob object
 * URL of the cutout (PNG with transparency). On ANY failure returns the
 * original source unchanged (never blocks the preview). Failures are NOT
 * cached so a transient network error can be retried by toggling again.
 */
export function removeImageBackground(
  src: string,
  onProgress?: (p: RemovalProgress) => void,
): Promise<string> {
  const key = String(src || "");
  if (!key) return Promise.resolve(key);

  const done = resolvedCache.get(key);
  if (done) return Promise.resolve(done);

  const running = inFlight.get(key);
  if (running) return running;

  const promise = (async (): Promise<string> => {
    try {
      const { removeBackground } = await loadLibrary();
      const blob = await removeBackground(key, {
        // Balanced quality/size — the fp16 model (~40 MB, cached after the
        // first use) is noticeably sharper around hair/edges than quint8.
        model: "isnet_fp16",
        output: { format: "image/png", quality: 0.9 },
        progress: (stage, current, total) => {
          if (!onProgress) return;
          const ratio = total > 0 ? current / total : 0;
          onProgress({
            stage: String(stage),
            ratio: Math.min(1, Math.max(0, ratio)),
          });
        },
      });
      const url = URL.createObjectURL(blob);
      resolvedCache.set(key, url);
      return url;
    } catch {
      // Graceful fallback — the original image is shown unchanged.
      return key;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
