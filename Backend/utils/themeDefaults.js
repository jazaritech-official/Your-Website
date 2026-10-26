/**
 * ============================================================
 * THEME TOKEN REGISTRY — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------------
 * The finite, curated set of brand tokens an Admin may re-brand
 * from the Admin Panel. Every entry maps a friendly API field to
 * the CSS custom property that Tailwind v4 already emits from
 * `Frontend/src/app/globals.css` (`@theme`).
 *
 * WHY THIS SET: it was derived from an audit of actual usage in
 * the customer-facing codebase, not invented. Usage counts below are
 * real Tailwind utility occurrences counted across customer-facing
 * files (`src/app`, excluding `Admin/` and `rider/`), so the
 * highest-leverage tokens come first:
 *
 *   brandGold       ~476   brandNavy       ~452
 *   surfaceCard     ~446   ink             ~308
 *   line            ~295   inkMuted        ~166
 *   surfaceMuted    ~168   inkSubtle       ~124
 *   brandGoldHover   ~94   stateDanger      ~63
 *   surfacePage      ~36   lineSoft         ~28
 *   stateSuccess     ~28   brandNavyDeep    ~19
 *   stateWarning     ~13   brandGoldStrong   ~6
 *   brandNavySoft     ~3   stateInfo         ~2
 *
 * Together these cover every `--color-*` token defined in
 * `globals.css`'s `@theme` block EXCEPT `--color-surface-beige`,
 * which is defined but has zero usages anywhere in the codebase and
 * is therefore deliberately not exposed (a knob that changes nothing
 * would only mislead an Admin).
 *
 * Tailwind compiles e.g. `bg-brand-navy` to
 * `background-color: var(--color-brand-navy)`, so overriding these
 * custom properties at runtime re-themes the whole storefront with
 * NO per-component migration. That is the entire mechanism.
 *
 * Deliberately NOT exposed (out of scope per the feature brief):
 * fonts, spacing, radii, shadows, layout, and the Admin/Rider
 * panel's own independent blue palette.
 */

/** Ordered token registry: apiKey → { cssVar, label, group, default }. */
export const THEME_TOKEN_REGISTRY = [
  // ── Brand ──
  {
    apiKey: "brandNavy",
    cssVar: "--color-brand-navy",
    label: "Primary brand (navy)",
    group: "Brand",
    default: "#222831",
  },
  {
    apiKey: "brandNavyDeep",
    cssVar: "--color-brand-navy-deep",
    label: "Primary brand deep (text on accent)",
    group: "Brand",
    default: "#1B2027",
  },
  {
    apiKey: "brandNavySoft",
    cssVar: "--color-brand-navy-soft",
    label: "Primary brand hover (soft navy)",
    group: "Brand",
    default: "#3B4257",
  },
  {
    apiKey: "brandGold",
    cssVar: "--color-brand-gold",
    label: "Accent (gold)",
    group: "Accent",
    default: "#C8A84E",
  },
  {
    apiKey: "brandGoldStrong",
    cssVar: "--color-brand-gold-strong",
    label: "Accent strong",
    group: "Accent",
    default: "#C9A227",
  },
  {
    apiKey: "brandGoldHover",
    cssVar: "--color-brand-gold-hover",
    label: "Accent hover (deep gold)",
    group: "Accent",
    default: "#B8943F",
  },
  // ── Surfaces ──
  {
    apiKey: "surfaceCard",
    cssVar: "--color-surface",
    label: "Card / panel background",
    group: "Surfaces",
    default: "#FFFFFF",
  },
  {
    apiKey: "surfacePage",
    cssVar: "--color-surface-page",
    label: "Page background",
    group: "Surfaces",
    default: "#F7F8FA",
  },
  {
    apiKey: "surfaceMuted",
    cssVar: "--color-surface-muted",
    label: "Muted background",
    group: "Surfaces",
    default: "#F1F5F9",
  },
  // ── Borders / dividers ──
  {
    apiKey: "line",
    cssVar: "--color-line",
    label: "Borders / dividers",
    group: "Borders",
    default: "#E5E7EB",
  },
  {
    apiKey: "lineSoft",
    cssVar: "--color-line-soft",
    label: "Subtle borders",
    group: "Borders",
    default: "#F1F3F5",
  },
  // ── Text ──
  {
    apiKey: "ink",
    cssVar: "--color-ink",
    label: "Primary text",
    group: "Text",
    default: "#111827",
  },
  {
    apiKey: "inkMuted",
    cssVar: "--color-ink-muted",
    label: "Secondary text",
    group: "Text",
    default: "#6B7280",
  },
  {
    apiKey: "inkSubtle",
    cssVar: "--color-ink-subtle",
    label: "Tertiary text",
    group: "Text",
    default: "#9CA3AF",
  },
  // ── Semantic state (meaningful use only) ──
  {
    apiKey: "stateSuccess",
    cssVar: "--color-state-success",
    label: "Success",
    group: "Status",
    default: "#16A34A",
  },
  {
    apiKey: "stateWarning",
    cssVar: "--color-state-warning",
    label: "Warning",
    group: "Status",
    default: "#D97706",
  },
  {
    apiKey: "stateDanger",
    cssVar: "--color-state-danger",
    label: "Danger / error",
    group: "Status",
    default: "#DC2626",
  },
  {
    apiKey: "stateInfo",
    cssVar: "--color-state-info",
    label: "Informational",
    group: "Status",
    default: "#2563EB",
  },
];

/** All valid API keys, in registry order. */
export const THEME_COLOR_KEYS = THEME_TOKEN_REGISTRY.map((t) => t.apiKey);

/* ── Accessible-contrast rules for semantic status tokens (F-11) ──────
 * Decision: the four semantic tokens (success/warning/danger/info) are
 * EXPOSED in the theme editor, but every value must stay accessible. They
 * are used both as badge fills (white text on them) and as marks on white
 * surfaces — both readings collapse to the same requirement: contrast
 * against white. WCAG 1.4.11 (non-text / UI-component contrast) sets 3:1,
 * which every default token passes; pale re-tints do not.
 */
export const SEMANTIC_COLOR_KEYS = THEME_TOKEN_REGISTRY.filter(
  (t) => t.group === "Status",
).map((t) => t.apiKey);

export const SEMANTIC_CONTRAST_MIN = 3;

const hexToRgb = (hex) => {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const channelLuminance = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative-luminance contrast ratio (1..21). Unparsable input → 1
 *  (callers validate hex format first — this never masks a bad value). */
export const contrastRatio = (hexA, hexB) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const lum = ([r, g, b2]) =>
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b2);
  const la = lum(a);
  const lb = lum(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** True when a status colour stays legible on white (and white text stays
 *  legible on it). */
export const meetsSemanticContrast = (hex) =>
  contrastRatio(hex, "#FFFFFF") >= SEMANTIC_CONTRAST_MIN;

/** apiKey → default hex. */
export const DEFAULT_THEME_COLORS = THEME_TOKEN_REGISTRY.reduce((acc, t) => {
  acc[t.apiKey] = t.default;
  return acc;
}, {});

/** Branding defaults (non-color). */
export const DEFAULT_BRANDING = {
  // Empty means "use the built-in /Irha Studio-12.jpg asset" — see the
  // frontend's resolveLogoUrl(). Kept empty on purpose so a store that has
  // never touched the customizer serves exactly the same markup as before.
  logoUrl: "",
  logoPublicId: "",
  siteName: "Irhas'Inn",
  tagline: "Customize Product All In One",
};

/**
 * Strict hex colour validation: #RGB / #RRGGBB / #RRGGBBAA.
 * Anything else is rejected so a typo can never produce an invalid
 * custom property (which would silently break a whole colour family).
 */
export const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const isValidHexColor = (value) =>
  typeof value === "string" && HEX_COLOR_REGEX.test(value.trim());
