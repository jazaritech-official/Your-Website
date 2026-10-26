import {
  ARABIC_FONT_STACK,
  DEFAULT_FONT_STACK,
  PREVIEW_FONTS_URL,
  SCRIPT_FONT_STACK,
  SERIF_FONT_STACK,
  detectRTLScript,
} from "./customizationPreview";

/* ============================================================
   Print Layout — stored, admin-detected product print layout
   ------------------------------------------------------------
   The layout is generated ONCE by the admin (Gemini Vision,
   server-side) and saved with the product. The customer preview
   renders purely from this stored data — no AI, no vision API,
   no quota, works offline after the layout has been fetched.

   Coordinates are normalized fractions of the FULL image (0..1);
   textLayer.x / textLayer.y is the CENTER of the text box.
   ============================================================ */

export interface PrintTextLayer {
  x: number; // normalized center X
  y: number; // normalized center Y
  width: number; // normalized box width
  height: number; // normalized box height
  rotation?: number; // degrees, positive = clockwise
  /** OPTIONAL skew (degrees) applied alongside rotation — only when non-zero. */
  skewX?: number;
  skewY?: number;
  fontFamily?: "sans" | "serif" | "script";
  fontSize?: number; // px in the normalized (≤1200px wide) image
  fontWeight?: number; // 400 | 600 | 800
  color?: string; // hex
  stroke?: boolean;
  strokeColor?: string; // hex
  shadow?: boolean;
  align?: "center" | "left" | "right";
  lineSpacing?: number; // line-height multiplier
  /** OPTIONAL letter-spacing (px, in the normalized ≤1200px image). */
  letterSpacing?: number;
  /** Backend-synthesized layer for blank products (no printed sample text). */
  isDefault?: boolean;
}

export interface PrintLayout {
  customizable: boolean;
  sampleText?: string;
  printableArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  textLayer?: PrintTextLayer | null;
  /** ALL printable regions — multi-print products; single-layer layouts omit it. */
  textLayers?: PrintTextLayer[] | null;
  /** OPTIONAL perspective quad (normalized corners) — applied only when present. */
  perspective?: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  } | null;
  /** OPTIONAL premium metadata (all nullable — never required by the renderer). */
  confidence?: number | null;
  surfaceType?: string | null;
  lightingDirection?: string | null;
  fabricType?: string | null;
  textureType?: string | null;
  blendMode?: string | null;
  /** The product image this layout was detected against (stale-layout guard). */
  sourceImage?: string | null;
  detectedAt?: string | null;
  renderVersion?: string | null;
}

/* Renderer version — bumped when the composite algorithm changes so order
   snapshots can record exactly which renderer produced a preview. */
export const PRINT_RENDER_VERSION = "v4";

/**
 * An uploaded image (photo/logo) composited into the print composite.
 * `src` is the FINAL source actually drawn — the caller passes the
 * background-removed cutout when "Remove background" is enabled.
 */
export interface PrintCompositeImage {
  id?: string;
  src: string;
  label?: string;
}

/** Safe centered fallback used when a stored layout is stale (image changed). */
export function buildSafeLayout(): PrintLayout {
  const layer: PrintTextLayer = {
    x: 0.5,
    y: 0.5,
    width: 0.6,
    height: 0.14,
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
  return {
    customizable: true,
    printableArea: { x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    textLayer: layer,
    textLayers: [layer],
    renderVersion: PRINT_RENDER_VERSION,
  };
}

/** Extract the Cloudinary public_id (path after /image/upload/) — the asset's
    true identity regardless of transforms/versions. Returns null when the URL
    is not a Cloudinary image. */
function cloudinaryPublicId(url: string): string | null {
  const m = String(url).match(/\/image\/upload\/(.+)$/);
  if (!m) return null;
  const parts = m[1].split("/");
  if (/^v\d+$/.test(parts[0] ?? "")) parts.shift(); // drop version segment
  const id = parts.join("/").replace(/\.[a-z0-9]+$/i, "");
  return id || null;
}

/** Compare product-image URLs loosely: query strings / trailing slashes and
    Cloudinary transform prefixes never falsely mark a layout stale — only a
    genuinely different asset does. */
function normalizeImageUrlForCompare(url: string): string {
  const trimmed = String(url || "").trim();
  const pubId = cloudinaryPublicId(trimmed);
  if (pubId) return `cloudinary:${pubId}`;
  try {
    const u = new URL(trimmed);
    u.search = "";
    u.hash = "";
    return u.href.replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\?.*$/, "").replace(/\/+$/, "");
  }
}

/** A layout is stale when it was detected against a DIFFERENT product image. */
export function isPrintLayoutStale(
  layout: PrintLayout | null | undefined,
  productImage: string,
): boolean {
  if (!layout || !layout.sourceImage || !productImage) return false;
  return (
    normalizeImageUrlForCompare(layout.sourceImage) !==
    normalizeImageUrlForCompare(productImage)
  );
}

/* ── Offline cache mirror (localStorage + memory) ──────────── */
const CACHE_PREFIX = "irhasinn_print_layout_v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const memCache = new Map<string, PrintLayout | null>();

function hashString(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/** Cached layout for a product image (mirrors what's stored with the product). */
export function getCachedPrintLayout(imageUrl: string): PrintLayout | null {
  const key = hashString(imageUrl);
  if (memCache.has(key)) return memCache.get(key) ?? null;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}:${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.ts && Date.now() - parsed.ts < CACHE_TTL_MS) {
        const layout = parsed.layout as PrintLayout;
        memCache.set(key, layout);
        return layout;
      }
    }
  } catch {
    /* best-effort */
  }
  return null;
}

export function setCachedPrintLayout(imageUrl: string, layout: PrintLayout | null): void {
  const key = hashString(imageUrl);
  memCache.set(key, layout);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}:${key}`,
      JSON.stringify({ ts: Date.now(), layout }),
    );
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/**
 * Convenience: layout from the product payload, cached, or null. PURE — no
 * side effects; callers may cache the result with setCachedPrintLayout.
 * - Truthy payload layout wins over the cache.
 * - An explicit null payload (admin cleared the layout) NEVER falls back to
 *   a stale cached layout — the preview must respect the clear.
 * - undefined (order/item snapshots that predate the field) falls back to
 *   the offline cache so existing orders/carts still render.
 * - A STALE layout (detected against a different product image) is replaced
 *   with the safe centered default instead of rendering old coordinates on
 *   the new image — the admin re-detects on the next product edit.
 */
export function resolvePrintLayout(
  productImage: string,
  productLayout: PrintLayout | null | undefined,
): PrintLayout | null {
  let layout: PrintLayout | null;
  if (productLayout !== undefined && productLayout !== null) {
    layout = productLayout;
  } else if (productLayout === null) {
    return null;
  } else {
    layout = getCachedPrintLayout(productImage) ?? null;
  }
  if (!layout) return null;

  const usable =
    layout.customizable &&
    (layout.textLayer ||
      (Array.isArray(layout.textLayers) && layout.textLayers.length > 0));

  // NEVER silently render old coordinates on a new image — fall back to the
  // safe centered default so the customer preview keeps working.
  if (isPrintLayoutStale(layout, productImage)) return buildSafeLayout();

  return usable ? layout : null;
}

/* ── Canvas composite renderer ─────────────────────────────── */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Sample the color just OUTSIDE the text box (rotation-aware, 16 points). */
function sampleSurroundingColor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  W: number,
  H: number,
): string | null {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dirs: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-0.7071, -0.7071],
    [0.7071, -0.7071],
    [-0.7071, 0.7071],
    [0.7071, 0.7071],
    [0, -0.5],
    [0, 0.5],
    [-0.5, 0],
    [0.5, 0],
    [-0.3827, -0.3827],
    [0.3827, -0.3827],
    [-0.3827, 0.3827],
    [0.3827, 0.3827],
  ];
  const m = 6;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [dx, dy] of dirs) {
    const ox = dx * (rx + m) * cos - dy * (ry + m) * sin;
    const oy = dx * (rx + m) * sin + dy * (ry + m) * cos;
    const x = Math.round(cx + ox);
    const y = Math.round(cy + oy);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d = ctx.getImageData(x, y, 1, 1).data;
    if (d[3] < 200) continue;
    r += d[0];
    g += d[1];
    b += d[2];
    n++;
  }
  if (!n) return null;
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}

/* ══════════════════════════════════════════════════════════════
   Canvas composite renderer (v3) — realistic print compositing
   ---------------------------------------------------------------
   1. Original product photo, pixel-identical.
   2. The ORIGINAL PRINT is removed FIRST — one content-aware erasure pass
      over the print region (printable area ∪ text boxes). A feathered mask
      is generated from the ACTUAL high-frequency print detail in the photo
      (never from the sampleText string, and never from the box alone):
      every flagged pixel is rebuilt as TRUE fabric color modulated by the
      local illumination (folds, shadows, highlights) plus the region's own
      micro-grain (from unmasked pixels only), so the old design is fully
      gone with no flat patch, no halo, no ghost.
   3. The customer's text is rendered on its own layer over the erased
      surface and blended with a SURFACE-AWARE composite op — multiply /
      overlay / screen / soft-light — chosen from the stored
      layout.blendMode (or by luminance / material), never a flat
      rectangle. The ink inherits the surface: the region's grain and
      lighting are re-applied ON TOP of the letters (texture mask), so the
      name is bright in highlights, deep in shadows, and woven into the
      fabric.
   4. Auto text fitting: word wrapping for long names ("MUHAMMAD
      ABDULLAH" wraps instead of ellipsizing), the font GROWS when there
      is room and SHRINKS when needed — it never overflows or clips.
   5. OPTIONAL perspective / skew are applied only when present.
   6. Multiple printable regions each render their own text field; a single
      region keeps the classic "all text in one block" behavior.
   7. Native-resolution output (up to 4K) — layout metrics are re-scaled
      from the 1200px analysis space, so 4K/8K/retina sources render sharp
      with text at the exact same proportional size.
   If advanced blending ever fails, the layer falls back to the legacy
   flat-fill implementation.
   ══════════════════════════════════════════════════════════════ */

interface CanvasQuad {
  m11: number;
  m12: number;
  m21: number;
  m22: number;
  m31: number;
  m32: number;
  g: number;
  h: number;
}

interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BoxGeometry {
  cx: number;
  cy: number;
  bboxW: number;
  bboxH: number;
  angle: number; // radians
  quad: CanvasQuad | null;
  crop: CropRect;
}

interface FittedText {
  fontSize: number;
  lines: string[];
  lineHeight: number;
}

function getRenderLayers(layout: PrintLayout): PrintTextLayer[] {
  const layers =
    Array.isArray(layout.textLayers) && layout.textLayers.length > 0
      ? layout.textLayers
      : layout.textLayer
        ? [layout.textLayer]
        : [];
  const seen = new Set<string>();
  return layers.filter((l) => {
    const key = `${l.x}|${l.y}|${l.width}|${l.height}|${l.rotation}|${l.fontSize}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Single layer = legacy (all text in one block). Multiple = one field each. */
function distributeTextAcrossLayers(text: string, layerCount: number): string[] {
  if (layerCount <= 1) return [text];
  const lines = String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return Array(layerCount).fill("");
  const out: string[] = [];
  for (let i = 0; i < layerCount; i++) out.push(lines[i] ?? "");
  if (lines.length > layerCount) {
    out[layerCount - 1] = [out[layerCount - 1], ...lines.slice(layerCount)]
      .filter(Boolean)
      .join("\n");
  }
  return out;
}

function familyFor(tl: PrintTextLayer, text: string): string {
  if (tl.fontFamily === "serif") return SERIF_FONT_STACK;
  if (tl.fontFamily === "script") return SCRIPT_FONT_STACK;
  return detectRTLScript(text) ? ARABIC_FONT_STACK : DEFAULT_FONT_STACK;
}

/* Apply ctx.letterSpacing (px) with a safe cast — older TS DOM libs don't
   type the property even though modern browsers support it. */
function setCtxLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = px ? `${px}px` : "0px";
}

function setCtxFont(
  ctx: CanvasRenderingContext2D,
  family: string,
  weight: number,
  fontSize: number,
  letterSpacing: number,
): void {
  ctx.font = `${weight} ${fontSize}px ${family}`;
  setCtxLetterSpacing(ctx, letterSpacing);
}

/** Greedy word wrap of one paragraph for a given font size (RTL-safe: splits
    on whitespace, so Arabic/Urdu names wrap too). */
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number,
  fontSize: number,
  family: string,
  weight: number,
  letterSpacing: number,
): string[] {
  const words = String(paragraph).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  setCtxFont(ctx, family, weight, fontSize, letterSpacing);
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Fit text into the box: GROW the font when there is room, SHRINK when the
 * widest line or the block height overflow, WRAP long names at word
 * boundaries first, and only ellipsize a single word that still can't fit at
 * the minimum size. Text never escapes the printable area, never clips, and
 * is never stretched.
 */
function fitTextToBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  boxW: number,
  boxH: number,
  lineSpacing: number,
  baseFontSize: number,
  letterSpacing = 0,
): FittedText | null {
  const paragraphs = String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;

  const maxWidth = Math.max(12, boxW * 0.94);
  const minFont = Math.max(6, baseFontSize * 0.35);
  // Grow ceiling: never taller than the box, and never more than 1.8x base.
  const growCap = Math.max(baseFontSize, Math.min(baseFontSize * 1.8, boxH * 0.9));
  const spacing = Math.max(1.1, lineSpacing);
  let fontSize = Math.max(minFont, baseFontSize);
  let lines: string[] = [];

  for (let iter = 0; iter < 40; iter++) {
    lines = paragraphs.flatMap((p) =>
      wrapParagraph(ctx, p, maxWidth, fontSize, family, weight, letterSpacing),
    );
    const blockH = lines.length * spacing * fontSize;
    let widest = 0;
    for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);

    if (blockH > boxH || widest > maxWidth) {
      // Overflow → shrink (proportionally to the worst offender).
      const hScale = blockH > boxH ? boxH / blockH : 1;
      const wScale = widest > maxWidth ? maxWidth / widest : 1;
      const next = fontSize * Math.min(hScale, wScale);
      if (next <= minFont || Math.abs(next - fontSize) < 0.5) {
        fontSize = Math.max(minFont, next);
        break;
      }
      fontSize = Math.max(minFont, next);
    } else if (
      fontSize < growCap &&
      widest < maxWidth * 0.9 &&
      blockH < boxH * 0.9
    ) {
      // Comfortable → grow a step and re-measure.
      fontSize = Math.min(growCap, fontSize * 1.05);
    } else {
      break;
    }
  }

  // Final pass at the settled size — guarantees consistency.
  lines = paragraphs.flatMap((p) =>
    wrapParagraph(ctx, p, maxWidth, fontSize, family, weight, letterSpacing),
  );
  // Last resort against vertical overflow (many paragraphs in a tiny box).
  while (lines.length > 1 && lines.length * spacing * fontSize > boxH) lines.pop();
  lines = lines
    .map((line) =>
      fitLineWithEllipsis(ctx, line, maxWidth, fontSize, family, weight, letterSpacing),
    )
    .filter(Boolean);
  if (!lines.length) return null;

  return { fontSize, lines, lineHeight: spacing * fontSize };
}

function fitLineWithEllipsis(
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
  fontSize: number,
  family: string,
  weight: number,
  letterSpacing: number,
): string {
  setCtxFont(ctx, family, weight, fontSize, letterSpacing);
  if (ctx.measureText(line).width <= maxWidth) return line;
  let lo = 0;
  let hi = line.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const prefix = line.slice(0, mid);
    if (ctx.measureText(`${prefix}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${line.slice(0, lo)}…`;
}

function parseCssColor(color: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Parse a CSS color ("#hex" or "rgb(r,g,b)") into an RGB tuple. */
function parseColorToRgb(color: string): [number, number, number] | null {
  const hex = parseCssColor(color);
  if (hex) return hex;
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color.trim());
  if (m) {
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  }
  return null;
}

/** Hermite smoothstep — a soft (anti-aliased) mask instead of a hard cut. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Low-frequency ILLUMINATION map of a region: downscale (heavily) then
 * upscale with high-quality smoothing. The result is a smooth lighting
 * field carrying highlights, shadows, ambient and folds — the text will
 * inherit exactly this lighting.
 */
function computeLightingMap(
  rctx: CanvasRenderingContext2D,
  rw: number,
  rh: number,
): ImageData {
  const smallW = Math.max(2, Math.min(48, Math.round(rw / 24)));
  const smallH = Math.max(2, Math.min(48, Math.round(rh / 24)));
  const small = document.createElement("canvas");
  small.width = smallW;
  small.height = smallH;
  const sctx = small.getContext("2d");
  if (!sctx) throw new Error("no lighting context");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(rctx.canvas, 0, 0, smallW, smallH);
  // Second upscale pass — one more smoothing step.
  const up = document.createElement("canvas");
  up.width = rw;
  up.height = rh;
  const uctx = up.getContext("2d");
  if (!uctx) throw new Error("no lighting upscale context");
  uctx.imageSmoothingEnabled = true;
  uctx.imageSmoothingQuality = "high";
  uctx.drawImage(small, 0, 0, rw, rh);
  return uctx.getImageData(0, 0, rw, rh);
}

/** Deterministic per-pixel hash → [-1, 1] — stable across keystrokes. */
function hashNoise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 2000) / 1000 - 1;
}

/** Smooth, DETERMINISTIC value-noise at `cell`-pixel scale. Replaces the old
    modulo tile: the result is organic fabric-like micro-grain with NO
    repeating block boundaries, and identical for identical coordinates (so
    the preview never flickers between keystrokes). */
function valueNoise(x: number, y: number, cell: number): number {
  const xi = Math.floor(x / cell);
  const yi = Math.floor(y / cell);
  const fx = x / cell - xi;
  const fy = y / cell - yi;
  const v00 = hashNoise(xi, yi);
  const v10 = hashNoise(xi + 1, yi);
  const v01 = hashNoise(xi, yi + 1);
  const v11 = hashNoise(xi + 1, yi + 1);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = v00 + (v10 - v00) * sx;
  const bottom = v01 + (v11 - v01) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Content-aware erasure of the ORIGINAL print inside a region.
 *
 * The mask is generated from the ACTUAL image content (high-frequency
 * detail against the local illumination), NEVER from layout.sampleText — so
 * it removes whatever text/artwork the photo really contains, even when the
 * AI's sampleText label does not match the pixels.
 *
 * Key properties (each one fixes a confirmed failure of earlier erasures):
 *  - Robust threshold: background grain is measured at the LOW end of the
 *    detail distribution (p25), so the print itself cannot inflate it (the
 *    old sigma/median-based threshold rose with letter contrast and left
 *    whole strokes untouched).
 *  - TIGHT mask: the masked fraction is CAPPED (~18% of the region) and the
 *    threshold is raised until the mask covers only the actual print — a
 *    large printableArea can never erase a whole shirt front. Isolated
 *    fabric-grain specks are removed (8-neighbour cleanup) and the mask is
 *    dilated by ONE pixel (closes letter gaps, never spreads).
 *  - Blank guard: a region with no coherent print detail is returned
 *    untouched → blank products stay pixel-identical.
 *  - Reconstruction NEVER reuses the print pixel: masked pixels are rebuilt
 *    from the chamfer-filled TRUE fabric illumination (nearest unmasked
 *    pixel — folds/shadows/highlights preserved) plus a TINY deterministic
 *    value-noise of the fabric's own grain amplitude. There is NO tile:
 *    repeating blocks (the checkerboard artifact) are impossible by
 *    construction.
 *  - The ORIGINAL PRINT's ink color (median of the masked pixels) is
 *    returned so the customer's new text can be rendered in the same ink.
 *  - Feathered mask: soft edges, no rectangular patch, no halo.
 */
function erasePrintContentInRegion(
  rctx: CanvasRenderingContext2D,
  rw: number,
  rh: number,
  lighting: ImageData,
  surfaceColor: [number, number, number] | null,
): {
  luminance: number;
  grainAmp: number;
  changed: boolean;
  inkColor: [number, number, number] | null;
} {
  const imageData = rctx.getImageData(0, 0, rw, rh);
  const d = imageData.data;
  const ld = lighting.data;
  const count = rw * rh;

  // Pass 1 — per-pixel detail (max channel |pixel − lighting|) plus
  // histograms for the robust threshold and the median surface color.
  const det = new Uint8Array(count);
  const hist = new Uint32Array(256);
  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);
  let lumN = 0;
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    if (d[i + 3] < 128) {
      det[p] = 0;
      continue;
    }
    const m = Math.max(
      Math.abs(d[i] - ld[i]),
      Math.abs(d[i + 1] - ld[i + 1]),
      Math.abs(d[i + 2] - ld[i + 2]),
    );
    const mv = m > 255 ? 255 : m;
    det[p] = mv;
    hist[mv]++;
    rHist[d[i]]++;
    gHist[d[i + 1]]++;
    bHist[d[i + 2]]++;
    lumN++;
  }
  if (!lumN) {
    return { luminance: 0.5, grainAmp: 6, changed: false, inkColor: null };
  }

  const histPercentile = (h: Uint32Array, q: number): number => {
    const target = Math.max(1, Math.floor((count * q) / 100));
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += h[v];
      if (acc >= target) return v;
    }
    return 255;
  };

  const p25 = histPercentile(hist, 25);
  const p97 = histPercentile(hist, 97);
  // Background grain lives at the LOW end of the detail spread — the print
  // cannot inflate it (unlike sigma/median, which the letters blow up). The
  // floor is raised so smooth-fabric micro-detail is never mistaken for
  // print (that over-triggering erased whole shirt fronts).
  let thr = Math.max(14, Math.min(48, Math.round(3.2 * p25)));
  // Blank-region guard: no coherent print detail → leave pixel-identical.
  // (The 90th percentile is NOT used here — on smooth fabric the background
  // detail is tiny, so a low p90 fired even when real print existed.)
  if (p97 < Math.max(26, thr * 2)) {
    return { luminance: 0.5, grainAmp: 6, changed: false, inkColor: null };
  }

  // Pass 2 — feathered content mask hugging the ACTUAL printed content
  // (soft edges via smoothstep — never a hard rectangular patch). The
  // masked FRACTION is capped: if more than ~18% of the region is flagged
  // (large printableArea, fold shadows, busy fabric), the threshold rises
  // until the mask covers only the print. If that never happens the region
  // is left untouched — a visible old print beats a destroyed product.
  const mask = new Uint8Array(count);
  const buildMask = (t: number): number => {
    let mCount = 0;
    for (let p = 0; p < count; p++) {
      const ad = det[p];
      if (ad <= t) {
        mask[p] = 0;
        continue;
      }
      const m = smoothstep(t, t * 2.4, ad);
      mask[p] = Math.round(m * 255);
      if (m > 0.5) mCount++;
    }
    return mCount;
  };
  const MAX_MASK_FRAC = 0.18;
  let masked = buildMask(thr);
  // Tighten the threshold until the mask covers only the print — capped at 5
  // rebuilds (thr climbs 1.35^5 ≈ 4.5×) so the per-keystroke cost on large
  // 4K crops stays bounded; each buildMask is O(count).
  if (masked / count > MAX_MASK_FRAC) {
    for (let i = 0; i < 5 && masked / count > MAX_MASK_FRAC; i++) {
      thr = Math.min(140, Math.round(thr * 1.35));
      masked = buildMask(thr);
    }
  }
  if (masked / count > MAX_MASK_FRAC || masked / count < 0.001) {
    return { luminance: 0.5, grainAmp: 6, changed: false, inkColor: null };
  }

  // Pass 3 — speckle cleanup: drop masked pixels that do not belong to a
  // coherent stroke (fewer than 2 masked 8-neighbours). Keeps print strokes
  // intact while removing isolated fabric-grain specks that would otherwise
  // be "reconstructed" into faint patches across the whole region.
  {
    const keep = new Uint8Array(count);
    for (let y = 0; y < rh; y++) {
      const row = y * rw;
      for (let x = 0; x < rw; x++) {
        const p = row + x;
        if (mask[p] < 128) continue;
        let nbr = 0;
        const y0 = Math.max(0, y - 1);
        const y1 = Math.min(rh - 1, y + 1);
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(rw - 1, x + 1);
        for (let yy = y0; yy <= y1; yy++) {
          const r2 = yy * rw;
          for (let xx = x0; xx <= x1; xx++) {
            if (xx === x && yy === y) continue;
            if (mask[r2 + xx] >= 128) nbr++;
          }
        }
        if (nbr >= 2) keep[p] = mask[p];
      }
    }
    let kept = 0;
    for (let p = 0; p < count; p++) if (keep[p] >= 128) kept++;
    if (kept / count >= 0.001) mask.set(keep); // don't nuke a thin stroke
  }

  // Pass 4 — dilate the mask (closes anti-aliasing halos, thin stroke tails
  // and the gaps inside letters). Radius 1 ONLY — radius 2 spread the mask
  // far beyond the print on large regions.
  dilateMask(mask, rw, rh, 1);

  // Pass 5 — fabric micro-grain amplitude from UNMASKED pixels only: RMS of
  // the residual against the lighting map, clamped to the fabric's own range
  // (fold creases are several times larger and would otherwise make the
  // rebuilt area noisier than the surrounding surface). This amplitude sizes
  // the deterministic value-noise used for reconstruction AND the ink
  // texture mask.
  let gAcc = 0;
  let gN = 0;
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    if (mask[p] > 32) continue;
    if (d[i + 3] < 128) continue;
    const r = d[i] - ld[i];
    const g = d[i + 1] - ld[i + 1];
    const b = d[i + 2] - ld[i + 2];
    gAcc += (r * r + g * g + b * b) / 3;
    gN++;
  }
  const grainAmp = gN
    ? Math.max(4, Math.min(10, Math.round(Math.sqrt(gAcc / gN))))
    : 6;

  // Surface color: the ring just outside the region (true fabric) when
  // available, otherwise the region's median (robust against print tint).
  // Used only for the returned surface luminance (ink blend-mode choice).
  let sur = surfaceColor;
  if (!sur) {
    sur = [
      histPercentile(rHist, 50),
      histPercentile(gHist, 50),
      histPercentile(bHist, 50),
    ];
  }
  const surLum =
    (0.2126 * sur[0] + 0.7152 * sur[1] + 0.0722 * sur[2]) / 255 || 0.5;

  // Pass 7 — replace masked pixels' values with the nearest unmasked
  // FABRIC COLOR. The lighting map is a blur of the whole region — where
  // the print dominates the zone (up to 80%+), that blur still carries the
  // print's darkness, so a lighting-only fill rebuilds the surface darker
  // than the true fabric. Seeding the chamfer with the RAW unmasked pixels
  // propagates the genuine fabric color/lighting (folds, creases, shadows
  // travel with the nearest value), then the value-noise adds the weave.
  for (let p = 0; p < count; p++) {
    if (mask[p] <= 32) {
      const i = p * 4;
      ld[i] = d[i];
      ld[i + 1] = d[i + 1];
      ld[i + 2] = d[i + 2];
    }
  }
  fillLightingNearest(ld, mask, rw, rh);

  // Pass 6 — the ORIGINAL PRINT's ink color. Runs AFTER the chamfer fill so
  // `ld` at masked pixels is the TRUE fabric color (nearest unmasked), not
  // the print-contaminated blur. Classify strong-detail masked pixels by
  // POLARITY against that fabric (much darker = dark ink on light fabric;
  // much lighter = light ink on dark fabric), take the MAJORITY polarity
  // (the actual print), and median THAT cluster's RGB — creases, fold
  // shadows and feathered edges don't dilute the hue.
  const strongThr = thr * 1.6;
  const darkHist: Array<Uint32Array> = [
    new Uint32Array(256),
    new Uint32Array(256),
    new Uint32Array(256),
  ];
  const lightHist: Array<Uint32Array> = [
    new Uint32Array(256),
    new Uint32Array(256),
    new Uint32Array(256),
  ];
  let darkN = 0;
  let lightN = 0;
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    if (mask[p] < 128 || det[p] < strongThr) continue; // strong print pixels
    if (d[i + 3] < 128) continue;
    const fabricLum = (ld[i] + ld[i + 1] + ld[i + 2]) / 3;
    const pxLum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (pxLum < fabricLum - 14) {
      darkHist[0][d[i]]++;
      darkHist[1][d[i + 1]]++;
      darkHist[2][d[i + 2]]++;
      darkN++;
    } else if (pxLum > fabricLum + 14) {
      lightHist[0][d[i]]++;
      lightHist[1][d[i + 1]]++;
      lightHist[2][d[i + 2]]++;
      lightN++;
    }
  }
  let inkColor: [number, number, number] | null = null;
  const pickMedian = (
    h: Array<Uint32Array>,
    total: number,
  ): [number, number, number] => {
    const half = total / 2;
    const med = (ch: Uint32Array): number => {
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += ch[v];
        if (acc >= half) return v;
      }
      return 128;
    };
    return [med(h[0]), med(h[1]), med(h[2])];
  };
  // The chosen polarity must be a CLEAR winner — creases/fold-shadows of one
  // polarity can otherwise outnumber a small print of the other and the
  // sampled "ink" would be fabric, not ink. Ambiguous → null → the text falls
  // back to its luminance-aware default color.
  const inkN = Math.max(darkN, lightN);
  if (inkN > 8 && (darkN === 0 || lightN === 0 || Math.max(darkN, lightN) / Math.min(darkN, lightN) >= 1.3)) {
    inkColor =
      darkN >= lightN ? pickMedian(darkHist, darkN) : pickMedian(lightHist, lightN);
  }
  // Pass 8 — reconstruct masked pixels: chamfer-filled TRUE fabric
  // illumination + a tiny deterministic value-noise of the fabric's own
  // grain amplitude. Deterministic (same pixels → same result on every
  // keystroke) and SEAMLESS (value noise has no tile boundaries — the
  // checkerboard artifact cannot reappear). Fully feathered by the mask —
  // no patch edge, no halo, no ghost, no dark tint from the erased print.
  // The cell is CAPPED at 12px so the grain stays fabric-fine even on large
  // 4K regions (an uncapped cell grows to ~35px → soft blotches, the very
  // artifact class this rewrite removes).
  const cell = Math.min(12, Math.max(4, Math.round(Math.min(rw, rh) / 80)));
  let changed = false;
  for (let y = 0; y < rh; y++) {
    const row = y * rw;
    for (let x = 0; x < rw; x++) {
      const p = row + x;
      const m = mask[p] / 255;
      if (m <= 0) continue;
      const i = p * 4;
      if (d[i + 3] < 128) continue;
      const grain = valueNoise(x, y, cell) * grainAmp;
      changed = true;
      for (let c = 0; c < 3; c++) {
        const base = clamp255(ld[i + c] + grain);
        d[i + c] = clamp255(d[i + c] * (1 - m) + base * m);
      }
    }
  }
  if (changed) rctx.putImageData(imageData, 0, 0);
  return { luminance: surLum, grainAmp, changed, inkColor };
}

/** Fill masked pixels' illumination from the NEAREST unmasked pixel via a
    two-pass chamfer distance propagation. The blurred lighting map alone is
    contaminated by the print it blurred, which made the old reconstruction
    darker than the true surface; propagating from unmasked fabric restores
    the correct local color/lighting (folds, creases and shadows travel with
    the nearest value, so they survive). */
function fillLightingNearest(
  ld: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
): void {
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const dist = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    if (mask[p] <= 32) {
      const i = p * 4;
      r[p] = ld[i];
      g[p] = ld[i + 1];
      b[p] = ld[i + 2];
      dist[p] = 0;
    } else {
      dist[p] = Infinity;
    }
  }
  const tryNeighbor = (p: number, np: number) => {
    if (np < 0 || np >= n) return;
    const nd = dist[np] + 1;
    if (nd < dist[p]) {
      dist[p] = nd;
      r[p] = r[np];
      g[p] = g[np];
      b[p] = b[np];
    }
  };
  // Forward pass (top-left → bottom-right).
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const p = row + x;
      if (mask[p] <= 32) continue;
      if (x > 0) tryNeighbor(p, p - 1);
      if (y > 0) tryNeighbor(p, p - w);
    }
  }
  // Backward pass (bottom-right → top-left).
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    for (let x = w - 1; x >= 0; x--) {
      const p = row + x;
      if (mask[p] <= 32) continue;
      if (x < w - 1) tryNeighbor(p, p + 1);
      if (y < h - 1) tryNeighbor(p, p + w);
    }
  }
  for (let p = 0; p < n; p++) {
    if (mask[p] <= 32) continue;
    const i = p * 4;
    ld[i] = r[p];
    ld[i + 1] = g[p];
    ld[i + 2] = b[p];
  }
}

/** Two-pass (H then V) box-max dilation of a byte mask — closes halos and
    thin stroke gaps without the cost of a full 2D window. */
function dilateMask(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
): void {
  if (radius <= 0) return;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let mx = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      for (let xx = x0; xx <= x1; xx++) {
        const v = mask[row + xx];
        if (v > mx) mx = v;
      }
      tmp[row + x] = mx;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let mx = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * w + x];
        if (v > mx) mx = v;
      }
      mask[y * w + x] = mx;
    }
  }
}

/** Sample the color of the ring just OUTSIDE a crop rectangle (the true
    product surface) — the reconstruction hue anchor. */
function sampleOutsideRingColor(
  ctx: CanvasRenderingContext2D,
  crop: CropRect,
  W: number,
  H: number,
): [number, number, number] | null {
  const out = Math.max(
    6,
    Math.min(48, Math.round(Math.min(crop.width, crop.height) * 0.03)),
  );
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const d = ctx.getImageData(xi, yi, 1, 1).data;
    if (d[3] < 200) return;
    r += d[0];
    g += d[1];
    b += d[2];
    n++;
  };
  const step = 28;
  const left = crop.left - out;
  const right = crop.left + crop.width + out;
  const top = crop.top - out;
  const bottom = crop.top + crop.height + out;
  for (let x = crop.left; x <= crop.left + crop.width; x += step) {
    add(x, top);
    add(x, bottom);
  }
  for (let y = crop.top; y <= crop.top + crop.height; y += step) {
    add(left, y);
    add(right, y);
  }
  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** The region that must be scanned for ORIGINAL printed content: the
    printable area (the AI's detected print zone) UNION every text box
    (where the customer's new text will go), padded. Confining the erasure
    to the textLayer box alone was exactly why the old print survived when
    the AI's box did not cover the real design. */
function computeErasureCrop(
  layout: PrintLayout,
  layers: PrintTextLayer[],
  W: number,
  H: number,
): CropRect | null {
  const pad = Math.max(10, Math.round(0.04 * Math.min(W, H)));
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const add = (x: number, y: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    const L = Math.max(0, Math.floor(x * W) - pad);
    const T = Math.max(0, Math.floor(y * H) - pad);
    const R = Math.min(W, Math.ceil((x + w) * W) + pad);
    const B = Math.min(H, Math.ceil((y + h) * H) + pad);
    if (R <= L || B <= T) return;
    if (L < left) left = L;
    if (T < top) top = T;
    if (R > right) right = R;
    if (B > bottom) bottom = B;
  };
  const pa = layout.printableArea;
  if (pa && pa.width > 0 && pa.height > 0) {
    add(pa.x, pa.y, pa.width, pa.height);
  }
  for (const tl of layers) {
    add(tl.x - tl.width / 2, tl.y - tl.height / 2, tl.width, tl.height);
  }
  if (left === Infinity) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** Drive the content-aware erasure for one region and blit the rebuilt
    surface back onto the main canvas (render coordinates — the source is
    the scaled canvas, so the crop is always pixel-aligned). Returns the
    ORIGINAL PRINT's ink color so the new text can match the sample. */
function erasePrintRegion(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  W: number,
  H: number,
  crop: CropRect,
): { changed: boolean; inkColor: [number, number, number] | null } {
  try {
    const rw = Math.max(1, Math.round(crop.width));
    const rh = Math.max(1, Math.round(crop.height));
    if (rw * rh <= 0) return { changed: false, inkColor: null };
    const region = document.createElement("canvas");
    region.width = rw;
    region.height = rh;
    const rctx = region.getContext("2d");
    if (!rctx) return { changed: false, inkColor: null };
    rctx.drawImage(source, crop.left, crop.top, rw, rh, 0, 0, rw, rh);
    const lighting = computeLightingMap(rctx, rw, rh);
    const ring = sampleOutsideRingColor(ctx, crop, W, H);
    const info = erasePrintContentInRegion(rctx, rw, rh, lighting, ring);
    if (info.changed) ctx.drawImage(region, crop.left, crop.top);
    return { changed: info.changed, inkColor: info.inkColor };
  } catch {
    /* best-effort — the text stage still renders on the original surface */
    return { changed: false, inkColor: null };
  }
}

/** Fabric micro-grain amplitude of a region (for the ink texture mask) —
    RMS of the residual against the lighting map, capped to a sane range. */
function estimateGrainAmp(
  rctx: CanvasRenderingContext2D,
  rw: number,
  rh: number,
  lighting: ImageData,
): number {
  try {
    const d = rctx.getImageData(0, 0, rw, rh).data;
    const ld = lighting.data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const r = d[i] - ld[i];
      const g = d[i + 1] - ld[i + 1];
      const b = d[i + 2] - ld[i + 2];
      sum += (r * r + g * g + b * b) / 3;
      n++;
    }
    if (!n) return 8;
    return Math.max(5, Math.min(18, Math.round(Math.sqrt(sum / n) * 1.2)));
  } catch {
    return 8;
  }
}

/** Average (opaque) color of a canvas region — used to erase the sample text
    when outside-color sampling fails. Returns null when unreadable. */
function averageRegionColor(
  rctx: CanvasRenderingContext2D,
  rw: number,
  rh: number,
): string | null {
  try {
    const data = rctx.getImageData(0, 0, rw, rh).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (!n) return null;
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch {
    return null;
  }
}

/** Homography (unit square → quad) in canvas setTransform parameter order. */
function computeQuad(
  perspective: NonNullable<PrintLayout["perspective"]>,
  W: number,
  H: number,
): CanvasQuad {
  const pt = (p: { x: number; y: number }) => ({
    x: Math.min(1, Math.max(0, p.x)) * W,
    y: Math.min(1, Math.max(0, p.y)) * H,
  });
  const tl = pt(perspective.tl);
  const tr = pt(perspective.tr);
  const br = pt(perspective.br);
  const bl = pt(perspective.bl);

  const x0 = tl.x, y0 = tl.y;
  const x1 = tr.x, y1 = tr.y;
  const x2 = br.x, y2 = br.y;
  const x3 = bl.x, y3 = bl.y;
  const dx1 = x1 - x2, dy1 = y1 - y2;
  const dx2 = x3 - x2, dy2 = y3 - y2;
  const sx = x2 + x0 - x1 - x3;
  const sy = y2 + y0 - y1 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  let g = 0;
  let h = 0;
  if (Math.abs(det) > 1e-6) {
    g = (sx * dy2 - dx2 * sy) / det;
    h = (dx1 * sy - sx * dy1) / det;
  }
  return {
    m11: x1 * (g + 1) - x0,
    m12: y1 * (g + 1) - y0,
    m21: x3 * (h + 1) - x0,
    m22: y3 * (h + 1) - y0,
    m31: x0,
    m32: y0,
    g,
    h,
  };
}

function computePerspectiveCrop(
  perspective: NonNullable<PrintLayout["perspective"]>,
  W: number,
  H: number,
  pad: number,
): CropRect {
  const pts = (["tl", "tr", "br", "bl"] as const).map((c) => {
    const p = perspective[c];
    return {
      x: Math.min(1, Math.max(0, p.x)) * W,
      y: Math.min(1, Math.max(0, p.y)) * H,
    };
  });
  const left = Math.max(0, Math.min(...pts.map((p) => p.x)) - pad);
  const top = Math.max(0, Math.min(...pts.map((p) => p.y)) - pad);
  const right = Math.min(W, Math.max(...pts.map((p) => p.x)) + pad);
  const bottom = Math.min(H, Math.max(...pts.map((p) => p.y)) + pad);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Apply the 8-argument perspective setTransform (unit square → quad). The
 * form is part of the Canvas 2D spec but the TS DOM lib only types the
 * 6-argument overload — cast to the extended signature.
 */
function applyQuadTransform(ctx: CanvasRenderingContext2D, quad: CanvasQuad): void {
  type Extended2D = CanvasRenderingContext2D & {
    setTransform(
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
      g: number,
      h: number,
    ): void;
  };
  (ctx as Extended2D).setTransform(
    quad.m11,
    quad.m12,
    quad.m21,
    quad.m22,
    quad.m31,
    quad.m32,
    quad.g,
    quad.h,
  );
}

/**
 * Choose the ink composite op: the stored layout.blendMode wins
 * (multiply / overlay / screen / soft-light — the values Gemini detects),
 * otherwise a luminance / material-aware default: dark surfaces take screen
 * (printed white ink), light surfaces take multiply (dark ink); glossy
 * materials default to overlay so the ink sits ON the surface.
 */
function resolveBlendMode(
  layout: PrintLayout,
  luminance: number,
): GlobalCompositeOperation {
  const mode = layout?.blendMode;
  if (
    mode === "multiply" ||
    mode === "screen" ||
    mode === "overlay" ||
    mode === "soft-light"
  ) {
    return mode;
  }
  // Material hint only when the detection was confident — otherwise keep the
  // v2 luminance behavior so older stored layouts render identically.
  const surface = layout?.surfaceType;
  const confident = (layout?.confidence ?? 0) >= 0.5;
  if (
    confident &&
    (surface === "ceramic" ||
      surface === "glass" ||
      surface === "metal" ||
      surface === "plastic" ||
      surface === "leather")
  ) {
    return luminance < 0.45 ? "screen" : "overlay";
  }
  return luminance < 0.45 ? "screen" : "multiply";
}

/**
 * Re-apply the surface ON TOP of the ink (the texture mask):
 *  - lighting modulation — the ink brightens in highlights and deepens in
 *    shadows, so the name follows the folds and ambient light;
 *  - micro-grain re-application — clamped original detail is added back
 *    INSIDE the letters so the weave/print texture shows through the ink.
 * Feathers by ink coverage (alpha) so anti-aliased edges stay smooth.
 */
function applyTextureToInk(
  rctx: CanvasRenderingContext2D,
  rw: number,
  rh: number,
  lighting: ImageData,
  orig: ImageData,
  inkAlpha: Uint8Array,
  mode: GlobalCompositeOperation,
  grainAmp: number,
): void {
  const tex = rctx.getImageData(0, 0, rw, rh);
  const td = tex.data;
  const ld = lighting.data;
  const od = orig.data;
  const count = rw * rh;

  // Mean lighting — normalization point for the modulation.
  let lsum = 0;
  let ln = 0;
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    if (ld[i + 3] >= 128) {
      lsum += 0.2126 * ld[i] + 0.7152 * ld[i + 1] + 0.0722 * ld[i + 2];
      ln++;
    }
  }
  if (!ln) return;
  const meanL = lsum / ln;
  // Same grain amplitude the erasure used, so the weave over the ink matches
  // the surrounding reconstructed fabric (no smooth-looking letters on a
  // coarse fabric). Bounded so coarse surfaces don't get noisy ink.
  const amp = Math.min(24, Math.max(6, grainAmp));
  // multiply already inherits lighting through the underlying fabric — a
  // weaker modulation avoids double-darkening folds; screen/overlay/soft-
  // light get the full inheritance. Strengthened so folds/highlights read
  // through the ink (the "flat label" look came from too-weak modulation).
  const strength = mode === "multiply" ? 0.45 : 0.75;

  for (let p = 0; p < count; p++) {
    const a = inkAlpha[p];
    if (a <= 8) continue;
    const f = a / 255; // coverage → edge feathering
    const i = p * 4;
    const Li = 0.2126 * ld[i] + 0.7152 * ld[i + 1] + 0.0722 * ld[i + 2];
    // 1) Lighting: highlight >1, shadow <1.
    const lightFactor = 1 + strength * (Li / meanL - 1);
    for (let c = 0; c < 3; c++) {
      // 2) Micro-grain: clamped original detail (kills the letter signal,
      //    keeps the weave).
      const grainC = Math.max(-amp, Math.min(amp, od[i + c] - ld[i + c]));
      const v = td[i + c] * lightFactor + grainC * 0.9 * f;
      td[i + c] = clamp255(v);
    }
  }
  rctx.putImageData(tex, 0, 0);
}

/** Paint ONE region with the v3 realistic-print pipeline. The region is
    cropped from the MAIN canvas (already erased) so the ink sits on the
    reconstructed surface — never on the old print. */
function paintTextTexturePreserving(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  W: number,
  H: number,
  box: BoxGeometry,
  tl: PrintTextLayer,
  fitted: FittedText,
  family: string,
  weight: number,
  align: "center" | "left" | "right",
  rtl: boolean,
  layout: PrintLayout,
  /** The ORIGINAL print's sampled ink color (RGB tuple) — text falls back
      to it when the layout carries no color, so the name matches the sample. */
  inkColor: [number, number, number] | null,
): void {
  const { cx, cy, bboxW, bboxH, angle, quad, crop } = box;
  const rw = Math.max(1, Math.round(crop.width));
  const rh = Math.max(1, Math.round(crop.height));

  // 1) Original region — the actual product pixels around the box. Kept for
  //    the texture mask applied over the ink later.
  const region = document.createElement("canvas");
  region.width = rw;
  region.height = rh;
  const rctx = region.getContext("2d");
  if (!rctx) throw new Error("no region context");
  rctx.drawImage(source, crop.left, crop.top, rw, rh, 0, 0, rw, rh);
  const origSnapshot = rctx.getImageData(0, 0, rw, rh);

  // 2) Lighting map — low-frequency illumination (highlights/shadows/folds).
  const lighting = computeLightingMap(rctx, rw, rh);

  // 3) Surface info for the ink. The region is ALREADY erased (the original
  //    print content was removed in one content-aware pass BEFORE the text
  //    stage — see renderPrintLayoutComposite), so here we only sample the
  //    local fabric color (for the ink blend mode) and the fabric grain
  //    amplitude (so the weave re-applied over the ink matches the surface).
  const pad = Math.max(6, bboxH * 0.15);
  let surrounding = sampleSurroundingColor(
    ctx,
    cx,
    cy,
    bboxW / 2 + pad,
    bboxH / 2 + pad,
    quad ? 0 : angle,
    W,
    H,
  );
  // If the surrounding-color sample fails (transparent/out-of-bounds region),
  // fall back to the region's own average so the blend mode still adapts.
  if (!surrounding) surrounding = averageRegionColor(rctx, rw, rh);
  const surRGB = surrounding ? parseColorToRgb(surrounding) : null;
  const luminance = surRGB
    ? (0.2126 * surRGB[0] + 0.7152 * surRGB[1] + 0.0722 * surRGB[2]) / 255
    : 0.5;
  const surface = {
    luminance,
    grainAmp: estimateGrainAmp(rctx, rw, rh, lighting),
  };
  // Effective ink color: the layout's detected color wins; otherwise the
  // old print's OWN ink (sampled during erasure) so the new name matches the
  // sample; otherwise a luminance-aware default (dark ink on light surfaces,
  // light ink on dark surfaces — consistent with the blend-mode picker).
  const effectiveColor =
    tl.color && parseColorToRgb(tl.color)
      ? tl.color
      : inkColor
        ? `rgb(${inkColor[0]},${inkColor[1]},${inkColor[2]})`
        : luminance > 0.45
          ? "#1A1A1A"
          : "#FFFFFF";

  // 4) Customer text layer (transparent) — font recreation: weight, spacing
  //    (letterSpacing), alignment, stroke/outline, shadow, line height.
  const tcanvas = document.createElement("canvas");
  tcanvas.width = rw;
  tcanvas.height = rh;
  const tctx = tcanvas.getContext("2d");
  if (!tctx) throw new Error("no text context");
  tctx.translate(rw / 2, rh / 2);
  // With a perspective quad the warp already encodes the surface angle, so
  // the extra rotation is only applied on the plain (non-quad) path.
  if (!quad) tctx.rotate(angle);
  if (tl.skewX || tl.skewY) {
    tctx.transform(
      1,
      Math.tan(((tl.skewY ?? 0) * Math.PI) / 180),
      Math.tan(((tl.skewX ?? 0) * Math.PI) / 180),
      1,
      0,
      0,
    );
  }
  setCtxFont(tctx, family, weight, fitted.fontSize, tl.letterSpacing ?? 0);
  tctx.textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
  tctx.textBaseline = "middle";
  if (rtl) tctx.direction = "rtl";
  // Soft shadow by default (a flat label reads as pasted-on; printed ink
  // almost always has a trace of depth). Explicit shadow:false is respected.
  if (tl.shadow !== false) {
    tctx.shadowColor = "rgba(0,0,0,0.35)";
    tctx.shadowBlur = fitted.fontSize * 0.18;
    tctx.shadowOffsetY = fitted.fontSize * 0.05;
  }
  if (tl.stroke) {
    tctx.strokeStyle = tl.strokeColor || "#FFFFFF";
    tctx.lineWidth = Math.max(1, fitted.fontSize * 0.06);
    tctx.lineJoin = "round";
  }
  tctx.fillStyle = effectiveColor;
  const startY = -((fitted.lines.length - 1) * fitted.lineHeight) / 2;
  fitted.lines.forEach((line, i) => {
    const y = startY + i * fitted.lineHeight;
    if (tl.stroke) tctx.strokeText(line, 0, y);
    tctx.fillText(line, 0, y);
  });

  // Ink coverage — used to feather the texture re-application at edges.
  const textData = tctx.getImageData(0, 0, rw, rh);
  const inkAlpha = new Uint8Array(rw * rh);
  for (let p = 0; p < rw * rh; p++) inkAlpha[p] = textData.data[p * 4 + 3];

  // 5) Surface-aware ink blend — multiply / overlay / screen / soft-light
  //    (from the stored layout, luminance, or detected material).
  const mode = resolveBlendMode(layout, surface.luminance);
  rctx.save();
  rctx.globalCompositeOperation = mode;
  rctx.drawImage(tcanvas, 0, 0);
  rctx.restore();

  // 6) Texture mask over the ink — grain + lighting inherited from the
  //    original surface, feathered by coverage (smooth anti-aliased edges).
  applyTextureToInk(
    rctx,
    rw,
    rh,
    lighting,
    origSnapshot,
    inkAlpha,
    mode,
    surface.grainAmp,
  );

  // 7) Blit the region back (the pad area is original pixels, so it stays
  //    pixel-identical outside the glyphs). Perspective warps it onto the
  //    quad — text follows the surface angle, not just rotation.
  ctx.save();
  if (quad) {
    applyQuadTransform(ctx, quad);
    ctx.drawImage(region, 0, 0, 1, 1);
  } else {
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(region, -rw / 2, -rh / 2);
  }
  ctx.restore();
}

/** Legacy fallback: flat-fill erase + direct text draw (pre-v2 behavior). */
function paintTextLegacy(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  box: BoxGeometry,
  tl: PrintTextLayer,
  fitted: FittedText,
  family: string,
  weight: number,
  align: "center" | "left" | "right",
  rtl: boolean,
  /** The ORIGINAL print's sampled ink color (RGB tuple). */
  inkColor: [number, number, number] | null,
): void {
  const { cx, cy, bboxW, bboxH, angle } = box;
  const pad = Math.max(4, bboxH * 0.2);
  const bg = sampleSurroundingColor(ctx, cx, cy, bboxW / 2 + pad, bboxH / 2 + pad, angle, W, H);
  const bgRGB = bg ? parseColorToRgb(bg) : null;
  const bgLum = bgRGB
    ? (0.2126 * bgRGB[0] + 0.7152 * bgRGB[1] + 0.0722 * bgRGB[2]) / 255
    : 0.5;
  const effectiveColor =
    tl.color && parseColorToRgb(tl.color)
      ? tl.color
      : inkColor
        ? `rgb(${inkColor[0]},${inkColor[1]},${inkColor[2]})`
        : bgLum > 0.45
          ? "#1A1A1A"
          : "#FFFFFF";
  if (bg) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = bg;
    roundRectPath(
      ctx,
      -(bboxW / 2 + pad),
      -(bboxH / 2 + pad),
      bboxW + pad * 2,
      bboxH + pad * 2,
      Math.min(bboxH / 2 + pad, 14),
    );
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.font = `${weight} ${fitted.fontSize}px ${family}`;
  setCtxLetterSpacing(ctx, 0); // never inherit letterSpacing from the fit pass
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (rtl) ctx.direction = "rtl";
  // Soft shadow by default (consistent with the advanced path).
  if (tl.shadow !== false) {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = fitted.fontSize * 0.18;
    ctx.shadowOffsetY = fitted.fontSize * 0.05;
  }
  if (tl.stroke) {
    ctx.strokeStyle = tl.strokeColor || "#FFFFFF";
    ctx.lineWidth = Math.max(1, fitted.fontSize * 0.06);
    ctx.lineJoin = "round";
  }
  ctx.fillStyle = effectiveColor;
  const startY = -((fitted.lines.length - 1) * fitted.lineHeight) / 2;
  fitted.lines.forEach((line, i) => {
    const y = startY + i * fitted.lineHeight;
    if (tl.stroke) ctx.strokeText(line, 0, y);
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

function renderTextLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layout: PrintLayout,
  tl: PrintTextLayer,
  text: string,
  fontScale: number,
  /** The ORIGINAL print's sampled ink color — text falls back to it when the
      layout carries no color, so the customer's name matches the sample. */
  inkColor: [number, number, number] | null,
): void {
  let cx = tl.x * W;
  let cy = tl.y * H;
  const bboxW = Math.max(10, tl.width * W);
  const bboxH = Math.max(8, tl.height * H);

  // Keep the text box inside the detected safe print area when provided.
  const pa = layout.printableArea;
  if (pa) {
    const halfW = bboxW / 2;
    const halfH = bboxH / 2;
    const minX = Math.max(0, pa.x * W) + halfW;
    const maxX = Math.min(W, (pa.x + pa.width) * W) - halfW;
    const minY = Math.max(0, pa.y * H) + halfH;
    const maxY = Math.min(H, (pa.y + pa.height) * H) - halfH;
    if (maxX > minX) cx = Math.min(maxX, Math.max(minX, cx));
    if (maxY > minY) cy = Math.min(maxY, Math.max(minY, cy));
  }

  const angle = ((tl.rotation ?? 0) * Math.PI) / 180;
  const quad = layout.perspective ? computeQuad(layout.perspective, W, H) : null;
  const pad = Math.max(6, bboxH * 0.15);
  const crop: CropRect = layout.perspective
    ? computePerspectiveCrop(layout.perspective, W, H, pad)
    : {
        left: cx - bboxW / 2 - pad,
        top: cy - bboxH / 2 - pad,
        width: bboxW + pad * 2,
        height: bboxH + pad * 2,
      };

  const family = familyFor(tl, text);
  // Bold by default — prints are heavy; a thin default looks pasted-on.
  const weight = tl.fontWeight ?? 800;
  const align: "center" | "left" | "right" =
    tl.align === "left" ? "left" : tl.align === "right" ? "right" : "center";
  const lineSpacing = Math.max(1.1, tl.lineSpacing ?? 1.2);

  const fitted = fitTextToBox(
    ctx,
    text,
    family,
    weight,
    bboxW,
    bboxH,
    lineSpacing,
    // layout.fontSize lives in the 1200px analysis space — scale it to the
    // actual render width so text keeps its exact proportional size at 4K.
    (tl.fontSize ?? bboxH * 0.8) * fontScale,
    tl.letterSpacing ?? 0,
  );
  if (!fitted) return;

  const rtl = detectRTLScript(text);
  const box: BoxGeometry = { cx, cy, bboxW, bboxH, angle, quad, crop };
  try {
    paintTextTexturePreserving(
      ctx,
      ctx.canvas,
      W,
      H,
      box,
      tl,
      fitted,
      family,
      weight,
      align,
      rtl,
      layout,
      inkColor,
    );
  } catch {
    // Advanced blending failed → the documented legacy fallback.
    paintTextLegacy(
      ctx,
      W,
      H,
      box,
      tl,
      fitted,
      family,
      weight,
      align,
      rtl,
      inkColor,
    );
  }
}

/* ── Uploaded image (photo/logo) compositing ──────────────────
   Uploaded images go through the SAME surface-aware pipeline as the text
   ink instead of being pasted on as flat HTML overlays:
   - Bounded aspect-preserving fit inside the detected print zone, capped so
     a loose printableArea can never make a photo look larger than a real
     print.
   - The layout's perspective quad warps the photo onto the product surface
     when the surface is angled in the photo.
   - Cutouts (background-removed photos, transparent logos) blend like
     printed ink (multiply/screen/overlay from the stored layout or the
     surface luminance); opaque photos keep their true colors.
   - The fabric lighting + weave are re-applied ON TOP of the print so the
     photo follows the folds and shading instead of reading as a sticker.
   ──────────────────────────────────────────────────────────── */

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load customization image"));
    img.src = src;
  });
}

/** Does the image carry transparency (a cutout / PNG logo) rather than an
    opaque photo? Cheap 48px sample — never throws. */
function imageHasTransparency(img: HTMLImageElement): boolean {
  try {
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Rough color-richness estimate: a full-color PHOTO has many distinct
    colors; a mono logo/ink design has few. 24px downsampled sample with
    4-bit-per-channel quantization — never throws. */
function imageIsColorRich(img: HTMLImageElement): boolean {
  try {
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue; // ignore transparent pixels
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      seen.add(key);
      if (seen.size > 24) return true; // plenty of distinct colors → photo
    }
    return false;
  } catch {
    return false;
  }
}

interface ImageFitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The region uploaded images belong in: the tight printable area when
    available, otherwise the primary text box. Mirrors the CSS overlay
    positioning used when no layout exists. */
function imageRegionFor(
  layout: PrintLayout,
  W: number,
  H: number,
): ImageFitRect | null {
  const pa = layout.printableArea;
  if (pa && pa.width > 0 && pa.height > 0) {
    return { x: pa.x * W, y: pa.y * H, width: pa.width * W, height: pa.height * H };
  }
  const tl =
    Array.isArray(layout.textLayers) && layout.textLayers.length > 0
      ? layout.textLayers[0]
      : layout.textLayer;
  if (tl) {
    return {
      x: (tl.x - tl.width / 2) * W,
      y: (tl.y - tl.height / 2) * H,
      width: tl.width * W,
      height: tl.height * H,
    };
  }
  return null;
}

/** Composite ONE uploaded image into the (already-erased) main canvas. */
async function paintCompositeImage(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  layout: PrintLayout,
  ci: PrintCompositeImage,
): Promise<void> {
  const img = await loadImageElement(ci.src);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const region = imageRegionFor(layout, W, H);
  if (!region || region.width <= 0 || region.height <= 0) return;

  // Bounded, aspect-preserving fit: the photo is inscribed in the print area
  // and its larger fitted side is capped at ~55% of the product's shorter
  // side, so a loose/generic printableArea (e.g. 0.84 of the whole garment)
  // can never blow a portrait up to look pasted larger than a real print.
  const maxSide = 0.55 * Math.min(W, H);
  let scale = Math.min(region.width / iw, region.height / ih);
  if (Math.max(iw * scale, ih * scale) > maxSide) {
    scale = Math.min(scale, maxSide / Math.max(iw, ih));
  }
  scale = Math.max(0.02, scale);
  const dw = iw * scale;
  const dh = ih * scale;

  const pad = Math.max(8, Math.round(Math.min(region.width, region.height) * 0.04));
  const crop: CropRect = layout.perspective
    ? computePerspectiveCrop(layout.perspective, W, H, pad)
    : {
        left: region.x - pad,
        top: region.y - pad,
        width: region.width + pad * 2,
        height: region.height + pad * 2,
      };
  const rw = Math.max(1, Math.round(crop.width));
  const rh = Math.max(1, Math.round(crop.height));

  // Region = the CURRENT main-canvas pixels (the old print already erased),
  // so the photo sits on the reconstructed fabric — never on the old design.
  const regionCanvas = document.createElement("canvas");
  regionCanvas.width = rw;
  regionCanvas.height = rh;
  const rctx = regionCanvas.getContext("2d");
  if (!rctx) return;
  rctx.drawImage(ctx.canvas, crop.left, crop.top, rw, rh, 0, 0, rw, rh);
  const origSnapshot = rctx.getImageData(0, 0, rw, rh);
  const lighting = computeLightingMap(rctx, rw, rh);

  // The photo on its own layer, centered in the region (aspect preserved).
  const layer = document.createElement("canvas");
  layer.width = rw;
  layer.height = rh;
  const lctx = layer.getContext("2d");
  if (!lctx) return;
  lctx.drawImage(img, (rw - dw) / 2, (rh - dh) / 2, dw, dh);
  const layerData = lctx.getImageData(0, 0, rw, rh);
  const alphaMask = new Uint8Array(rw * rh);
  for (let p = 0; p < rw * rh; p++) alphaMask[p] = layerData.data[p * 4 + 3];

  // Cutouts (background-removed photos / transparent logos) are blended like
  // printed ink — multiply on light fabric, screen on dark, honoring the
  // stored blendMode. Opaque photos keep their true colors ('source-over')
  // but still inherit the fabric lighting + grain below.
  const isCutout = imageHasTransparency(img);
  const surRGB = parseColorToRgb(averageRegionColor(rctx, rw, rh) || "#808080") ?? null;
  const luminance = surRGB
    ? (0.2126 * surRGB[0] + 0.7152 * surRGB[1] + 0.0722 * surRGB[2]) / 255
    : 0.5;
  // A full-color PHOTO cutout on a DARK surface keeps its true colors
  // (source-over + lighting) instead of being crushed to near-black by
  // multiply — the same way a real DTG print uses a white underbase on dark
  // garments. Mono logos still get the ink blend (white-ink screen on dark).
  const colorRichPhoto = isCutout && imageIsColorRich(img);
  const blendInk =
    isCutout && (luminance >= 0.45 || !colorRichPhoto);
  const mode: GlobalCompositeOperation = blendInk
    ? resolveBlendMode(layout, luminance)
    : "source-over";

  rctx.save();
  rctx.globalCompositeOperation = mode;
  rctx.drawImage(layer, 0, 0);
  rctx.restore();

  // Fabric lighting + weave over the print — folds, shadows and highlights
  // read through the photo (this is what makes it sit ON the shirt instead
  // of looking pasted on top of it).
  applyTextureToInk(
    rctx,
    rw,
    rh,
    lighting,
    origSnapshot,
    alphaMask,
    mode,
    estimateGrainAmp(rctx, rw, rh, lighting),
  );

  // Blit back — the perspective quad warps the photo onto the angled
  // surface when the layout carries one.
  ctx.save();
  if (layout.perspective) {
    const quad = computeQuad(layout.perspective, W, H);
    applyQuadTransform(ctx, quad);
    ctx.drawImage(regionCanvas, 0, 0, 1, 1);
  } else {
    ctx.drawImage(regionCanvas, crop.left, crop.top);
  }
  ctx.restore();
}

/**
 * Produce the final composite (JPEG data URL) from the STORED layout.
 * Multi-region products render each printable area separately; single-region
 * products keep the classic "all text in one block" behavior. Uploaded
 * images (photos/logos) are composited through the same surface-aware
 * pipeline before the text. Returns null on any failure so the caller can
 * show "Preview unavailable" instead of a broken image.
 */
export async function renderPrintLayoutComposite(
  image: HTMLImageElement,
  layout: PrintLayout,
  text: string,
  images?: PrintCompositeImage[],
): Promise<string | null> {
  try {
    if (!layout?.customizable) return null;
    const layers = getRenderLayers(layout);
    if (!layers.length) return null;

    const trimmed = String(text ?? "").trim();
    const imagesList = (images ?? []).filter((ci) => ci && ci.src);
    if (!trimmed && imagesList.length === 0) return null;

    // Adaptive output resolution — never the old 1200px cap. Targets the
    // device's display density (retina/4K monitors get up to 4096px; phones
    // stay lean), so quality is never reduced on large screens while the
    // per-pixel texture work stays fast on small ones. The layout's fontSize
    // (defined in the 1200px analysis space) is re-scaled via fontScale =
    // W / 1200, keeping text at the exact same proportional size everywhere.
    const MAX_RENDER_DIM = 4096;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const viewW = typeof window !== "undefined" ? window.innerWidth || 1600 : 1600;
    const target = Math.min(
      MAX_RENDER_DIM,
      Math.max(1600, Math.round(viewW * dpr)),
    );
    const base = Math.max(1, image.naturalWidth);
    const renderScale = Math.min(1, target / base);
    const W = Math.max(1, Math.round(image.naturalWidth * renderScale));
    const H = Math.max(1, Math.round(image.naturalHeight * renderScale));
    const fontScale = W / 1200;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 1) Original photo — untouched.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, W, H);

    // 1.5) REMOVE THE ORIGINAL PRINT — one content-aware pass over the
    //    print region (printable area ∪ text boxes) BEFORE any customer
    //    text is drawn. Whatever text/artwork the photo actually contains
    //    (whether or not it matches the AI's sampleText label) is erased
    //    and the underlying surface is rebuilt from the real fabric around
    //    it. This is the fix for the "old print survives" bug: the erasure
    //    is image-content driven and covers the whole print zone, not just
    //    the textLayer box.
    let detectedInkColor: [number, number, number] | null = null;
    try {
      const eraseCrop = computeErasureCrop(layout, layers, W, H);
      if (eraseCrop) {
        const res = erasePrintRegion(ctx, ctx.canvas, W, H, eraseCrop);
        detectedInkColor = res.inkColor;
      }
    } catch {
      /* best-effort — the text stage still renders on the original surface */
    }

    // 1.75) Uploaded images (photos/logos) — composited through the SAME
    //    surface-aware pipeline as the text ink: bounded aspect-preserving
    //    fit inside the detected print zone, perspective warp when the
    //    surface is angled, ink-style blend for cutouts, and the fabric
    //    lighting/weave re-applied on top. Drawn BEFORE the text so a name
    //    can sit over a photo print.
    for (const ci of imagesList) {
      try {
        await paintCompositeImage(ctx, W, H, layout, ci);
      } catch {
        /* skip a broken/unloadable image — the rest of the design still renders */
      }
    }

    // 2) Distribute the customer's fields across the printable regions.
    const layerTexts = distributeTextAcrossLayers(trimmed, layers.length);

    for (let i = 0; i < layers.length; i++) {
      const layerText = layerTexts[i];
      if (!layerText) continue;
      const tl = layers[i];
      const fontStr = `${tl.fontWeight ?? 800} ${(tl.fontSize ?? 48) * fontScale}px ${familyFor(tl, layerText)}`;
      try {
        await document.fonts.load(fontStr, layerText);
      } catch {
        /* fallback font */
      }
      renderTextLayer(ctx, W, H, layout, tl, layerText, fontScale, detectedInkColor);
    }

    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    return null; // graceful — caller shows "Preview unavailable"
  }
}
