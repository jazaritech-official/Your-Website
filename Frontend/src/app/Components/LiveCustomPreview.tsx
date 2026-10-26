"use client";

import React, { memo, useEffect, useMemo, useState } from "react";
import {
  PREVIEW_FONTS_URL,
  getFieldKey,
  isImageUrlValue,
  sanitizePreviewText,
} from "../utils/customizationPreview";
import { removeImageBackground } from "../utils/backgroundRemoval";
import type { PrintLayout } from "../utils/printLayout";
import {
  usePrintLayoutRender,
  type PreviewImageInput,
} from "../utils/usePrintLayoutRender";

/* ============================================================
   AI Live Custom Preview — print-accurate product preview
   ------------------------------------------------------------
   The preview is generated from the STORED print layout that the
   ADMIN detected once per product image (server-side Gemini
   Vision, saved with the product). The customer's text is drawn
   into the photo with the canvas composite renderer — ONLY the
   sample text printed on the product is replaced; every other
   pixel stays identical.

   - No AI runs while the customer is typing (zero quota).
   - No random text overlays, no guesswork, no overlay fallback.
   - If a product has no stored layout → "Preview unavailable".
   - Uploaded images (logos/photos) are composited through the SAME
     surface-aware canvas pipeline as the text (perspective, ink
     blend, fabric lighting) instead of being pasted on as flat
     rectangles.
   - "Remove background" runs a REAL client-side AI segmentation
     (ONNX/WASM in the browser — zero server AI) and the cutout is
     what gets composited.
   ============================================================ */

export interface LiveCustomizationField {
  fieldType: string;
  label: string;
  required?: boolean;
}

export interface LiveCustomPreviewProps {
  productImage: string;
  /** Keyed maps (checkout / product page) — key = `${fieldType}|${label}` */
  fields?: LiveCustomizationField[];
  answers?: Record<string, string>;
  images?: Record<string, string>;
  /** Raw answers (admin / order view) — derived automatically. */
  rawAnswers?: Array<{ label: string; value: string }>;
  alt?: string;
  className?: string;
  showEmptyHint?: boolean;
  /** Stored admin-detected print layout (from the product payload). */
  printLayout?: PrintLayout | null;
  /**
   * Remove the uploaded photo's background (client-side AI).
   * A plain boolean applies to every image layer; a per-field map applies
   * only to the layer whose id matches (`${fieldType}|${label}` for field
   * maps, `raw-<index>` for rawAnswers).
   */
  removeBackground?: boolean | Record<string, boolean>;
  /**
   * How the base product photo fits its container.
   * "contain" (default) letterboxes the full photo; "cover" crops it to
   * fill a fixed-size square thumbnail — used so cart rows show the
   * personalized preview with the SAME image treatment as normal items.
   */
  fit?: "contain" | "cover";
}

const SAFE_INSET_IMAGE = "16%";
const Z_IMAGE = 5;

function wantsRemovalFor(
  removeBackground: boolean | Record<string, boolean> | undefined,
  layerId: string,
): boolean {
  if (!removeBackground) return false;
  if (typeof removeBackground === "boolean") return removeBackground;
  return !!removeBackground[layerId];
}

/** Preflight: can this image be drawn into the canvas (CORS)? */
function canLoadCrossOrigin(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/* ── Uploaded image layer — plain HTML overlay fallback ──
   Used ONLY when a product has no stored layout (or an image cannot be
   drawn into the canvas composite), so the customer's image never
   disappears. When a layout exists the photo is composited into the
   canvas renderer instead (perspective + blend + lighting). */
interface PreviewImageLayerProps {
  layer: { id: string; label: string; value: string };
  /** Background-removed cutout when ready (else the original). */
  resolvedSrc?: string;
  /** Normalized region (0..1) the image should sit inside — printableArea or
      the primary text box. Falls back to the legacy fixed inset when absent. */
  region?: { x: number; y: number; width: number; height: number } | null;
}

const PreviewImageLayer = memo(function PreviewImageLayer({
  layer,
  resolvedSrc,
  region,
}: PreviewImageLayerProps) {
  const src = resolvedSrc || layer.value;

  // Uploaded logos/photos must follow the detected printable area (aspect
  // preserved, centered, auto-scaled) instead of a hardcoded inset.
  const placementStyle: React.CSSProperties = region
    ? {
        left: `${Math.max(0, Math.min(1, region.x)) * 100}%`,
        top: `${Math.max(0, Math.min(1, region.y)) * 100}%`,
        width: `${Math.max(0.01, Math.min(1, region.width)) * 100}%`,
        height: `${Math.max(0.01, Math.min(1, region.height)) * 100}%`,
        zIndex: Z_IMAGE,
      }
    : { inset: SAFE_INSET_IMAGE, zIndex: Z_IMAGE };

  return (
    <div
      className="pointer-events-none absolute flex select-none items-center justify-center overflow-hidden"
      style={placementStyle}
      aria-hidden="true"
    >
      <img
        src={src}
        alt={layer.label}
        loading="lazy"
        draggable={false}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.15))",
        }}
      />
    </div>
  );
});

/* ── Empty-state: show exactly where the name will be printed ── */
function PlacementHint({ layout }: { layout: PrintLayout }) {
  const tl = layout.textLayer;
  if (tl) {
    return (
      <div
        className="pointer-events-none absolute z-[15] flex select-none items-center justify-center rounded-lg border border-dashed border-brand-gold/40 bg-brand-gold/[0.04]"
        style={{
          left: `${Math.max(0, Math.min(1, tl.x - tl.width / 2)) * 100}%`,
          top: `${Math.max(0, Math.min(1, tl.y - tl.height / 2)) * 100}%`,
          width: `${Math.max(0.01, Math.min(1, tl.width)) * 100}%`,
          height: `${Math.max(0.01, Math.min(1, tl.height)) * 100}%`,
        }}
        aria-hidden="true"
      >
        <span className="whitespace-nowrap rounded-full bg-brand-gold/90 px-2.5 py-0.5 text-[8px] font-bold tracking-wide text-white shadow-xs sm:text-[9px]">
          YOUR NAME
        </span>
      </div>
    );
  }
  const pa = layout.printableArea;
  if (pa) {
    return (
      <div
        className="pointer-events-none absolute z-[15] flex select-none items-center justify-center rounded-xl border border-dashed border-brand-gold/30 bg-brand-gold/[0.03]"
        style={{
          left: `${Math.max(0, Math.min(1, pa.x)) * 100}%`,
          top: `${Math.max(0, Math.min(1, pa.y)) * 100}%`,
          width: `${Math.max(0.01, Math.min(1, pa.width)) * 100}%`,
          height: `${Math.max(0.01, Math.min(1, pa.height)) * 100}%`,
        }}
        aria-hidden="true"
      >
        <span className="whitespace-nowrap rounded-full bg-brand-gold/90 px-2.5 py-0.5 text-[8px] font-bold tracking-wide text-white shadow-xs sm:text-[9px]">
          YOUR NAME
        </span>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-[16%] z-[15] flex select-none items-center justify-center rounded-2xl border border-dashed border-brand-gold/30 bg-brand-gold/[0.03]">
      <p className="max-w-[75%] text-center text-[10px] font-semibold leading-relaxed text-brand-navy/50 sm:text-[11px]">
        Your personalization will appear here
      </p>
    </div>
  );
}

/* ── Rendering shimmer overlay ── */
function RenderingOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center">
      <div className="rounded-full bg-brand-navy/70 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-gold" />
        Updating preview…
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────── */
const LiveCustomPreview = memo(function LiveCustomPreview({
  productImage,
  fields,
  answers,
  images,
  rawAnswers,
  alt,
  className = "",
  showEmptyHint = true,
  printLayout,
  removeBackground = false,
  fit = "contain",
}: LiveCustomPreviewProps) {
  const [baseRatio, setBaseRatio] = useState<number | null>(null);
  // Background-removal cutouts + busy flags, keyed by image layer id.
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>(
    {},
  );
  const [removalBusy, setRemovalBusy] = useState<Record<string, boolean>>({});
  // Layers that CANNOT be drawn into the canvas (CORS/load failure) — they
  // still render as an HTML overlay so the customer's image never vanishes.
  const [unloadable, setUnloadable] = useState<Record<string, boolean>>({});

  // Lazy-load webfonts (Arabic, script, serif) only when a preview mounts.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("irhasinn-preview-fonts")) return;
    const link = document.createElement("link");
    link.id = "irhasinn-preview-fonts";
    link.rel = "stylesheet";
    link.href = PREVIEW_FONTS_URL;
    document.head.appendChild(link);
  }, []);

  // The customer's personalization text (text answers joined with newlines).
  const text = useMemo<string>(() => {
    if (rawAnswers?.length) {
      return rawAnswers
        .filter((a) => !isImageUrlValue(a.value))
        .map((a) => sanitizePreviewText(a.value, 300))
        .filter(Boolean)
        .join("\n");
    }
    if (fields?.length && answers) {
      const parts: string[] = [];
      fields.forEach((f) => {
        if (f.fieldType === "image") return;
        const v = sanitizePreviewText(
          answers[getFieldKey(f.fieldType, f.label)] || "",
        );
        if (v) parts.push(v);
      });
      return parts.join("\n");
    }
    return "";
  }, [fields, answers, rawAnswers]);

  // Uploaded images (logos / photos).
  const imageLayers = useMemo(() => {
    const out: Array<{ id: string; label: string; value: string }> = [];
    if (rawAnswers?.length) {
      rawAnswers.forEach((a, i) => {
        const value = sanitizePreviewText(a.value, 300);
        if (value && isImageUrlValue(value)) {
          out.push({ id: `raw-${i}`, label: a.label || "", value });
        }
      });
    } else if (fields?.length) {
      fields.forEach((f) => {
        if (f.fieldType !== "image") return;
        const key = getFieldKey(f.fieldType, f.label);
        const url = images?.[key];
        if (url) out.push({ id: key, label: f.label, value: url });
      });
    }
    return out;
  }, [fields, images, rawAnswers]);

  // Images handed to the canvas composite — the background-removed cutout
  // wins when "Remove background" is enabled and the cutout is ready.
  const compositeImages = useMemo<PreviewImageInput[]>(
    () =>
      imageLayers.map((l) => ({
        id: l.id,
        src: l.value,
        resolvedSrc: wantsRemovalFor(removeBackground, l.id)
          ? resolvedImages[l.id] || undefined
          : undefined,
        label: l.label,
      })),
    [imageLayers, removeBackground, resolvedImages],
  );

  // Zero-AI renderer — composite from the stored print layout. The hook
  // returns the RESOLVED layout (the safe centered default when the stored
  // layout is stale) so hints & image positioning stay consistent with the
  // text that is actually rendered. It renders whenever there is text OR an
  // uploaded image to print.
  const { status, renderUrl, layout: resolvedLayout } = usePrintLayoutRender(
    productImage,
    printLayout,
    text,
    compositeImages,
  );

  // Where uploaded images belong (HTML-overlay fallback): the detected
  // printable area when available, otherwise the primary text box, otherwise
  // the legacy fixed inset. Uses the RESOLVED layout so positioning never
  // disagrees with the rendered text.
  const imageRegion = useMemo(() => {
    const l = resolvedLayout ?? printLayout;
    if (!l) return null;
    const pa = l.printableArea;
    if (pa) return { x: pa.x, y: pa.y, width: pa.width, height: pa.height };
    const tl = l.textLayer;
    if (tl) {
      return {
        x: tl.x - tl.width / 2,
        y: tl.y - tl.height / 2,
        width: tl.width,
        height: tl.height,
      };
    }
    return null;
  }, [resolvedLayout, printLayout]);

  // ── Real background removal: resolve the cutout when the checkbox is on ──
  useEffect(() => {
    let cancelled = false;
    const wanted = imageLayers.filter((l) =>
      wantsRemovalFor(removeBackground, l.id),
    );
    // Keep the busy map in sync — layers whose checkbox was turned off (or
    // removed) must never leave a stuck "Removing background…" chip behind.
    setRemovalBusy((p) => {
      let next = p;
      imageLayers.forEach((l) => {
        if (!wantsRemovalFor(removeBackground, l.id) && p[l.id]) {
          if (next === p) next = { ...p };
          delete next[l.id];
        }
      });
      return next;
    });
    if (!wanted.length) return;
    wanted.forEach((l) => {
      if (resolvedImages[l.id]) return; // already resolved (session cache)
      setRemovalBusy((p) => (p[l.id] ? p : { ...p, [l.id]: true }));
      removeImageBackground(l.value)
        .then((out) => {
          if (cancelled) return;
          // A failed removal resolves to the original src — leave it unset so
          // toggling the checkbox again retries instead of silently staying
          // on the backgrounded image.
          if (out === l.value) return;
          setResolvedImages((p) => (p[l.id] ? p : { ...p, [l.id]: out }));
        })
        .finally(() => {
          if (!cancelled) setRemovalBusy((p) => ({ ...p, [l.id]: false }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [imageLayers, removeBackground, resolvedImages]);

  // ── Preflight: which layers can be drawn into the canvas? ──
  useEffect(() => {
    let cancelled = false;
    imageLayers.forEach((l) => {
      if (unloadable[l.id] !== undefined) return;
      canLoadCrossOrigin(l.value).then((ok) => {
        if (cancelled) return;
        setUnloadable((p) =>
          p[l.id] !== undefined ? p : { ...p, [l.id]: !ok },
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [imageLayers, unloadable]);

  // Layers rendered as plain HTML overlays: those of products with NO usable
  // layout (canvas can't composite anything), plus any image that could not
  // be drawn into the canvas.
  const overlayLayers = useMemo(
    () =>
      imageLayers.filter((l) => !resolvedLayout || unloadable[l.id] === true),
    [imageLayers, resolvedLayout, unloadable],
  );

  const anyRemovalBusy = useMemo(
    () => Object.values(removalBusy).some(Boolean),
    [removalBusy],
  );

  // Base photo — the composite when ready, otherwise the original photo.
  const baseSrc = renderUrl ?? productImage;

  const containerStyle: React.CSSProperties = {
    aspectRatio: baseRatio
      ? String(Math.min(1.6, Math.max(0.8, baseRatio)))
      : "1",
  };

  const unavailable = status === "no-layout" || status === "error";
  const isRendering = status === "rendering";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-[#F8F7F4] ring-1 ring-line/80 sm:rounded-3xl ${className}`}
      style={containerStyle}
      role="img"
      aria-label={alt || "Preview of your customized product"}
    >
      {/* Base product photo — the print-layout composite when ready */}
      <img
        src={baseSrc}
        alt={alt || "Product preview"}
        loading="lazy"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setBaseRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
        className={`absolute inset-0 z-[1] h-full w-full select-none transition-opacity duration-300 ${
          fit === "cover" ? "object-cover" : "object-contain"
        }`}
      />

      {/* Rendering shimmer — subtle indicator while canvas computes */}
      {isRendering && <RenderingOverlay />}

      {/* Where the name will be printed (only while the customer hasn't typed) */}
      {status === "empty" && showEmptyHint && (resolvedLayout ?? printLayout) && (
        <PlacementHint layout={resolvedLayout ?? printLayout!} />
      )}

      {/* HTML overlay fallback images — products without a layout, or images
          that couldn't be composited into the canvas */}
      {overlayLayers.map((layer) => (
        <PreviewImageLayer
          key={layer.id}
          layer={layer}
          resolvedSrc={
            wantsRemovalFor(removeBackground, layer.id)
              ? resolvedImages[layer.id]
              : undefined
          }
          region={imageRegion}
        />
      ))}

      {/* Background-removal progress chip — the cutout swaps in when ready */}
      {anyRemovalBusy && (
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex select-none items-center gap-1.5 rounded-full bg-brand-navy/75 px-2.5 py-1 text-[9px] font-semibold text-white shadow-sm backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-gold" />
          Removing background…
        </div>
      )}

      {/* No stored layout → professional "unavailable" notice, no overlay.
          Skipped in compact cover thumbnails (cart rows) where the pill would
          be unreadable — the base photo is shown instead. */}
      {unavailable && fit !== "cover" && (
        <div className="pointer-events-none absolute inset-0 z-[30] flex select-none items-center justify-center bg-surface/30 backdrop-blur-[1px]">
          <div className="rounded-xl border border-line/80 bg-surface/95 px-4 py-2.5 text-center shadow-sm">
            <p className="text-[11px] font-semibold text-brand-navy/70 sm:text-xs">
              {status === "error"
                ? "Preview couldn't be updated. Your customization is still saved."
                : "Preview coming soon for this product."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

export default LiveCustomPreview;
