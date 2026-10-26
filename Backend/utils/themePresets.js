/**
 * ============================================================
 * CURATED COLOR PALETTE PRESETS
 * ------------------------------------------------------------
 * Ready-made, professionally balanced palettes that fill in EVERY
 * registered brand token at once. Choosing a preset is purely a fast
 * way to populate the same colour fields the individual pickers
 * write — it is NOT a separate storage or save mechanism, and each
 * palette remains fully editable token-by-token afterwards.
 *
 * WHY BACKEND-SERVED: the token registry already ships from the
 * backend (`utils/themeDefaults.js`) and the Admin panel fetches it,
 * so presets live next to it. New palettes can then be added by
 * deploying the API alone, with no frontend release.
 *
 * COMPLETENESS CONTRACT
 * Every preset MUST define every key in `THEME_COLOR_KEYS`. This is
 * asserted by `__tests__/themePresets.test.js` — a preset missing a
 * token would otherwise leave that token silently stuck on whatever
 * the admin previously had, producing an incoherent mix.
 *
 * DESIGN NOTES
 *  • The four SEMANTIC tokens (success / warning / danger / info) are
 *    deliberately IDENTICAL in every palette. They are functional
 *    signals, not brand decoration — a customer must be able to read
 *    "Delivered" vs "Cancelled" the same way regardless of palette, so
 *    they are never re-tinted to match a brand hue.
 *  • `ink` is the primary text colour and pairs with `surfaceCard`, so
 *    each palette keeps body text at roughly 12:1 or better against its
 *    card background for readability.
 *  • `brandNavyDeep` is the text colour used ON the accent (e.g. the
 *    label inside a gold button), so each palette keeps it dark enough
 *    to stay legible on its own accent.
 */

/** Semantic tokens — intentionally constant across every palette. */
const SEMANTIC = {
  stateSuccess: "#16A34A",
  stateWarning: "#D97706",
  stateDanger: "#DC2626",
  stateInfo: "#2563EB",
};

export const THEME_PRESETS = [
  {
    id: "irhas-classic",
    name: "Irhas Classic",
    description: "The original navy + gold identity",
    colors: {
      brandNavy: "#222831",
      brandNavyDeep: "#1B2027",
      brandNavySoft: "#3B4257",
      brandGold: "#C8A84E",
      brandGoldStrong: "#C9A227",
      brandGoldHover: "#B8943F",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F7F8FA",
      surfaceMuted: "#F1F5F9",
      line: "#E5E7EB",
      lineSoft: "#F1F3F5",
      ink: "#111827",
      inkMuted: "#6B7280",
      inkSubtle: "#9CA3AF",
      ...SEMANTIC,
    },
  },
  {
    id: "midnight-gold",
    name: "Midnight Gold",
    description: "Premium black with warm gold accents",
    colors: {
      brandNavy: "#111111",
      brandNavyDeep: "#000000",
      brandNavySoft: "#2A2A2A",
      brandGold: "#D4AF37",
      brandGoldStrong: "#C9A227",
      brandGoldHover: "#B8943F",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FAFAF9",
      surfaceMuted: "#F3F4F6",
      line: "#E4E4E7",
      lineSoft: "#F0F0F1",
      ink: "#0A0A0A",
      inkMuted: "#5C5C66",
      inkSubtle: "#8E8E99",
      ...SEMANTIC,
    },
  },
  {
    id: "ocean-slate",
    name: "Ocean Slate",
    description: "Cool, modern slate blue with a crisp blue accent",
    colors: {
      // Deliberately the DARKER end of the slate ramp: the blue accent needs
      // enough luminance separation from the surface it sits on to read
      // (verified at ≥ 3:1 by themePresets.test.js).
      brandNavy: "#0F172A",
      brandNavyDeep: "#020617",
      brandNavySoft: "#1E293B",
      brandGold: "#2563EB",
      brandGoldStrong: "#1D4ED8",
      brandGoldHover: "#1E40AF",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F8FAFC",
      surfaceMuted: "#F1F5F9",
      line: "#E2E8F0",
      lineSoft: "#F1F5F9",
      ink: "#0F172A",
      inkMuted: "#64748B",
      inkSubtle: "#94A3B8",
      ...SEMANTIC,
    },
  },
  {
    id: "terracotta-warm",
    name: "Terracotta Warm",
    description: "Earthy, handcrafted feel in clay and cream",
    colors: {
      brandNavy: "#4A2C2A",
      brandNavyDeep: "#3A211F",
      brandNavySoft: "#6B4A45",
      brandGold: "#C2703D",
      brandGoldStrong: "#A85C2E",
      brandGoldHover: "#93501F",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FBF7F3",
      surfaceMuted: "#F5EDE4",
      line: "#E8DCD0",
      lineSoft: "#F3E9DF",
      ink: "#2E1F1C",
      inkMuted: "#7A625B",
      inkSubtle: "#A79289",
      ...SEMANTIC,
    },
  },
  {
    id: "emerald-forest",
    name: "Emerald Forest",
    description: "Deep green with a fresh botanical accent",
    colors: {
      brandNavy: "#14342B",
      brandNavyDeep: "#0B241C",
      brandNavySoft: "#1F4A3C",
      brandGold: "#2E9E6B",
      brandGoldStrong: "#26875B",
      brandGoldHover: "#1F6F4A",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F6FAF8",
      surfaceMuted: "#EDF5F1",
      line: "#DCEDE5",
      lineSoft: "#EFF7F3",
      ink: "#10231C",
      inkMuted: "#5C7268",
      inkSubtle: "#8CA096",
      ...SEMANTIC,
    },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    description: "Understated grayscale, gallery-like",
    colors: {
      brandNavy: "#1A1A1A",
      brandNavyDeep: "#0A0A0A",
      brandNavySoft: "#3D3D3D",
      brandGold: "#6B7280",
      brandGoldStrong: "#4B5563",
      brandGoldHover: "#374151",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F7F7F7",
      surfaceMuted: "#EFEFEF",
      line: "#E0E0E0",
      lineSoft: "#F0F0F0",
      ink: "#111111",
      inkMuted: "#6B6B6B",
      inkSubtle: "#9A9A9A",
      ...SEMANTIC,
    },
  },
  {
    id: "rose-pastel",
    name: "Rose Pastel",
    description: "Soft muted plum with a gentle rose accent",
    colors: {
      brandNavy: "#3F3D56",
      brandNavyDeep: "#2F2D42",
      brandNavySoft: "#565473",
      brandGold: "#E58AA0",
      brandGoldStrong: "#D2738C",
      brandGoldHover: "#B85F78",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FDF9FA",
      surfaceMuted: "#F9EDF1",
      line: "#F0DCE3",
      lineSoft: "#F9EEF2",
      ink: "#2B2938",
      inkMuted: "#736F85",
      inkSubtle: "#A29FB0",
      ...SEMANTIC,
    },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum legibility — stark black on white with bold yellow",
    colors: {
      brandNavy: "#000000",
      brandNavyDeep: "#000000",
      brandNavySoft: "#1F2937",
      brandGold: "#FFD400",
      brandGoldStrong: "#F0C000",
      brandGoldHover: "#D9AE00",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FFFFFF",
      surfaceMuted: "#F2F2F2",
      line: "#111827",
      lineSoft: "#D1D5DB",
      ink: "#000000",
      inkMuted: "#374151",
      inkSubtle: "#6B7280",
      ...SEMANTIC,
    },
  },
];

/** Preset ids, handy for validation. */
export const THEME_PRESET_IDS = THEME_PRESETS.map((preset) => preset.id);

/** Look a preset up by id. */
export const findThemePreset = (id) =>
  THEME_PRESETS.find((preset) => preset.id === id) || null;
