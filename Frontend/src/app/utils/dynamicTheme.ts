/**
 * ============================================================
 * DYNAMIC THEME — SHARED HELPERS
 * ------------------------------------------------------------
 * The storefront is already fully tokenised: every brand colour is a
 * Tailwind v4 theme token in `globals.css` (`--color-brand-navy`, …) and
 * Tailwind compiles utilities to `var(--color-*)` references, e.g.
 *
 *     .bg-brand-navy { background-color: var(--color-brand-navy) }
 *
 * (verified against the built stylesheet). So re-theming the ENTIRE site
 * requires exactly one thing: overriding those custom properties at runtime.
 * No per-component colour migration is needed — that is the whole mechanism.
 *
 * The Admin-configured values and the token→variable mapping both come from
 * the backend (`Backend/utils/themeDefaults.js`), so this module never holds
 * a second copy of either. It only converts the payload into CSS text.
 * ============================================================
 */

/** Tag used with Next's on-demand revalidation for the server theme fetch. */
export const THEME_TAG = "store-theme";

/** The single `<style>` element that carries the runtime overrides. */
export const THEME_STYLE_ID = "ir-theme-overrides";

/** Built-in asset, used whenever no custom logo has been uploaded. */
export const DEFAULT_LOGO_URL = "/Irha Studio-12.jpg";

/**
 * Fallback branding text.
 *
 * These MUST stay byte-identical to the values `Backend/utils/themeDefaults.js`
 * ships as `DEFAULT_BRANDING`, and to what the components rendered before this
 * feature. They are what every consumer falls back to when no theme could be
 * read, so the storefront's markup is unchanged in that case.
 */
export const DEFAULT_SITE_NAME = "Irhas'Inn";
export const DEFAULT_TAGLINE = "Customize Product All In One";

/** apiKey → hex, exactly as stored/served by the backend. */
export type ThemeColors = Record<string, string>;

export interface ThemePayload {
  colors: ThemeColors;
  /** cssVar → hex (e.g. "--color-brand-navy" → "#222831"), ready to inject. */
  cssVars: Record<string, string>;
  logoUrl: string;
  siteName: string;
  tagline: string;
  updatedAt?: string | null;
}

export interface ThemeToken {
  apiKey: string;
  cssVar: string;
  label: string;
  group: string;
  default: string;
}

export interface ThemeDefaults {
  colors: ThemeColors;
  logoUrl: string;
  logoPublicId: string;
  siteName: string;
  tagline: string;
}

/**
 * A ready-made palette that fills in EVERY registered token at once.
 *
 * Served by the backend alongside the registry so new palettes can ship
 * without a frontend release. Selecting one only writes the colour fields the
 * individual pickers already write — there is no separate save path, and the
 * result stays fully editable token-by-token.
 */
export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
}

export interface ThemeAdminPayload {
  theme: ThemePayload;
  defaults: ThemeDefaults;
  registry: ThemeToken[];
  presets?: ThemePreset[];
}

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Strict hex validation — mirrors the backend so bad input never reaches it. */
export const isValidHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR_REGEX.test(value.trim());

/* ── Accessible-contrast rules for semantic status tokens (F-11) ──────
 * Client-side mirror of Backend/utils/themeDefaults.js — keep in sync.
 * The four status tokens are used as badge fills (white text on them) AND
 * as marks on white surfaces, so both readings require contrast against
 * white. WCAG 1.4.11 sets 3:1, which every default token passes.
 */
export const SEMANTIC_CONTRAST_MIN = 3;

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const channelLuminance = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative-luminance contrast ratio (1..21); unparsable input → 1. */
export const contrastRatio = (hexA: string, hexB: string): number => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const lum = ([r, g, b2]: [number, number, number]) =>
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b2);
  const la = lum(a);
  const lb = lum(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** True when a status colour stays legible on white (and white text on it). */
export const meetsSemanticContrast = (value: string): boolean =>
  contrastRatio(value, "#FFFFFF") >= SEMANTIC_CONTRAST_MIN;

/**
 * Build the override stylesheet.
 *
 * Selector is `html:root` rather than plain `:root` on purpose: Tailwind emits
 * its defaults as `:root{--color-…}`, and `html:root` (specificity 0-2-1) beats
 * `:root` (0-1-0) no matter which stylesheet the browser evaluates first. That
 * removes any dependence on insertion order relative to the compiled CSS.
 *
 * Invalid/missing values are dropped, so a malformed payload can never emit a
 * broken declaration that would take a whole colour family down.
 */
export function buildThemeCss(
  cssVars: Record<string, string> | undefined | null,
): string {
  if (!cssVars || typeof cssVars !== "object") return "";
  const declarations = Object.entries(cssVars)
    .filter(([name, value]) => name.startsWith("--") && isValidHexColor(value))
    .map(([name, value]) => `${name}:${value.trim()};`)
    .join("");
  return declarations ? `html:root{${declarations}}` : "";
}

/**
 * Convert the admin registry + a set of token values into the cssVars shape.
 * Used by the Admin panel's live preview and by "Reset to Default", both of
 * which operate on unsaved values.
 */
export function cssVarsFromTokens(
  registry: ThemeToken[] | undefined,
  colors: ThemeColors | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(registry) || !colors) return out;
  for (const token of registry) {
    const value = colors[token.apiKey];
    if (token?.cssVar && isValidHexColor(value)) out[token.cssVar] = value.trim();
  }
  return out;
}

/** Custom logo when one is configured, otherwise the built-in asset. */
export function resolveLogoUrl(logoUrl?: string | null): string {
  return typeof logoUrl === "string" && logoUrl.trim()
    ? logoUrl.trim()
    : DEFAULT_LOGO_URL;
}

/**
 * Push theme overrides into the document immediately.
 *
 * The server-rendered `<style>` is the source of truth for first paint; this
 * only exists so the Admin sees their saved/reset changes take effect in the
 * current tab without a reload. It updates that SAME element in place, so
 * there is never a second competing `html:root` block to reconcile.
 *
 * Passing `null`/`{}` clears the overrides (back to the compiled defaults).
 */
export function applyThemeClientSide(
  cssVars: Record<string, string> | undefined | null,
): void {
  if (typeof document === "undefined") return;
  const css = buildThemeCss(cssVars);
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    if (el) el.textContent = "";
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
