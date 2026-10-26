"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  renderPrintLayoutComposite,
  resolvePrintLayout,
  setCachedPrintLayout,
  type PrintCompositeImage,
  type PrintLayout,
} from "./printLayout";

/* ============================================================
   usePrintLayoutRender — customer-side print-layout renderer
   ------------------------------------------------------------
   Purely client-side and ZERO-AI:
   - Resolves the STORED admin-detected print layout (from the
     product payload, or the offline cache keyed by image URL).
   - Debounces the customer's text and produces a canvas
     composite where ONLY the sample text printed on the product
     is replaced — every other pixel stays identical.
   - No API calls, no vision calls, no quota — everything runs
     locally after the layout has been stored with the product.
   ============================================================ */

const DEBOUNCE_MS = 250;

// Module-level image cache so repeated renders never re-download the photo.
// Bounded to the most-recently-used images to avoid unbounded session memory.
const imageCache = new Map<string, Promise<HTMLImageElement> | HTMLImageElement>();
const MAX_CACHED_IMAGES = 20;

function cacheImage(src: string, value: Promise<HTMLImageElement> | HTMLImageElement) {
  imageCache.set(src, value);
  if (imageCache.size > MAX_CACHED_IMAGES) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached instanceof HTMLImageElement && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  if (cached instanceof Promise) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load product image"));
    img.src = src;
  });
  cacheImage(src, promise);
  promise.catch(() => imageCache.delete(src));
  return promise;
}

export type PrintRenderStatus =
  | "no-layout" // no stored layout → "Preview unavailable for this product."
  | "empty" // layout ready but the customer hasn't typed anything yet
  | "rendering" // text entered, composite is being computed
  | "ready" // composite ready
  | "error"; // render failed → "Preview unavailable for this product."

export interface UsePrintLayoutRenderResult {
  status: PrintRenderStatus;
  renderUrl: string | null;
  /** The RESOLVED layout actually used for rendering — may be the safe
      centered default when the stored layout is stale (image changed). */
  layout: PrintLayout | null;
}

export interface PreviewImageInput {
  id: string;
  /** Original uploaded image. */
  src: string;
  /** Background-removed cutout when "Remove background" is enabled and ready. */
  resolvedSrc?: string;
  label?: string;
}

/** The images actually drawn into the composite — resolved cutout wins. */
function toCompositeImages(images?: PreviewImageInput[]): PrintCompositeImage[] {
  return (images ?? [])
    .filter((im) => im && im.src)
    .map((im) => ({
      id: im.id,
      src: im.resolvedSrc || im.src,
      label: im.label,
    }));
}

export function usePrintLayoutRender(
  productImage: string,
  productLayout: PrintLayout | null | undefined,
  text: string,
  images?: PreviewImageInput[],
): UsePrintLayoutRenderResult {
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Stable snapshot of the images to draw — identity changes when a
  // background-removal result arrives so the composite re-renders.
  const compositeImages = useMemo(
    () => toCompositeImages(images),
    [images],
  );

  // Stored layout from the product payload, falling back to the offline cache.
  const layout = useMemo(
    () => resolvePrintLayout(productImage, productLayout),
    [productImage, productLayout],
  );

  // Mirror the resolved layout into the offline cache (after render).
  useEffect(() => {
    setCachedPrintLayout(productImage, layout);
  }, [productImage, layout]);

  // Render generation counter — ensures newest render always wins.
  // When the user types "A" → "AB" → "ABC" rapidly, each keystroke
  // increments the generation. An older render that completes after a
  // newer one started will see its generation is stale and discard the result.
  const generationRef = useRef(0);

  useEffect(() => {
    if (
      !layout?.customizable ||
      (!layout.textLayer &&
        !(Array.isArray(layout.textLayers) && layout.textLayers.length > 0))
    ) {
      setRenderUrl(null);
      return;
    }
    const trimmed = text.trim();
    const hasImages = compositeImages.length > 0;
    // A composite is only meaningful when there is something to print —
    // customer text and/or an uploaded image.
    if (!trimmed && !hasImages) {
      setRenderUrl(null);
      return;
    }

    const gen = ++generationRef.current;
    let idleHandle: number | ReturnType<typeof setTimeout> | null = null;
    setFailed(false);

    // Render logic — only WHEN it runs is deferred below.
    const runComposite = () => {
      (async () => {
        try {
          const img = await loadImage(productImage);
          if (gen !== generationRef.current) return;
          const url = await renderPrintLayoutComposite(
            img,
            layout,
            trimmed,
            compositeImages,
          );
          if (gen !== generationRef.current) return;
          if (url) {
            setRenderUrl(url);
            setFailed(false);
          } else {
            setFailed(true);
          }
        } catch {
          if (gen === generationRef.current) setFailed(true);
        }
      })();
    };

    const timer = window.setTimeout(() => {
      // Defer the heavy canvas composite to an idle callback so the browser
      // can paint the input's own value update first (keeps typing smooth).
      // requestIdleCallback isn't in Safari — fall back to a short timeout.
      if (typeof (window as any).requestIdleCallback === "function") {
        idleHandle = (window as any).requestIdleCallback(runComposite, {
          timeout: 300,
        });
      } else {
        idleHandle = window.setTimeout(runComposite, 50);
      }
    }, DEBOUNCE_MS);

    return () => {
      // Increment generation so any in-flight render from this effect
      // invocation is automatically discarded when it completes.
      generationRef.current++;
      window.clearTimeout(timer);
      if (idleHandle !== null) {
        if (typeof (window as any).cancelIdleCallback === "function") {
          (window as any).cancelIdleCallback(idleHandle);
        } else {
          window.clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
        }
      }
    };
  }, [productImage, layout, text, compositeImages]);

  let status: PrintRenderStatus;
  if (
    !layout?.customizable ||
    (!layout.textLayer &&
      !(Array.isArray(layout.textLayers) && layout.textLayers.length > 0))
  )
    status = "no-layout";
  else if (!text.trim() && compositeImages.length === 0) status = "empty";
  else if (failed) status = "error";
  else if (renderUrl) status = "ready";
  else status = "rendering";

  return { status, renderUrl, layout };
}
