/**
 * ============================================================
 * INDUSTRY DESIGN PRESET LIBRARY (STATIC — Frontend)
 * ------------------------------------------------------------
 * Reusable PRESENTATION defaults per industry. Presets are pure
 * typed configuration: colour palettes, typography preset ids,
 * layout/hero variants and suggested homepage section orders.
 *
 * WHAT PRESETS ARE NOT
 *  • Not database records — no seeding required.
 *  • They never create products, categories, orders or reviews.
 *    Catalog data always comes from the real shared catalog.
 *  • Not executable code — the storefront only renders section
 *    types from the controlled registry (backend
 *    `utils/showcaseConfig.js` SECTION_TYPES).
 *
 * PRESET DEFAULTS + SAVED OVERRIDES = EFFECTIVE CONFIG
 * Applying a preset fills the profile's editable draft fields;
 * every value remains manually editable afterwards, and preset
 * values are NOT re-applied on page load (saved config wins).
 *
 * ID CONTRACT (F-06/F-10)
 * The canonical id list lives in `shared/industryPresetIds.json`. These
 * preset objects, the backend registry
 * (`Backend/utils/showcaseConfig.js → INDUSTRY_PRESET_IDS`) and that JSON
 * must stay identical — enforced by
 * `Backend/__tests__/industryPresetParity.test.js`, which parses THIS file
 * from disk and fails on any drift.
 * ============================================================
 */

/** Colour token keys — mirror of Backend/utils/themeDefaults.js registry. */
export interface ShowcasePalette {
  brandNavy: string;
  brandNavyDeep: string;
  brandNavySoft: string;
  brandGold: string;
  brandGoldStrong: string;
  brandGoldHover: string;
  surfaceCard: string;
  surfacePage: string;
  surfaceMuted: string;
  line: string;
  lineSoft: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
}

export type TypographyPresetId =
  | "classic-serif"
  | "modern-sans"
  | "editorial"
  | "minimal";

export type SectionTypeId =
  | "hero"
  | "featuredCategories"
  | "featuredProducts"
  | "categoryRow"
  | "promoBanner"
  | "brandIntro"
  | "trustRow"
  | "reviewSummary";

export interface HeroVariantDefaults {
  /** Controlled layout variant used by the storefront hero renderer. */
  variant: "split" | "full" | "editorial";
  /** Guidance for the operator — never rendered as fake copy. */
  headingHint: string;
  subheadingHint: string;
  primaryCtaHint: string;
  /** Suggested image composition notes for the operator. */
  imageHint: string;
}

export interface IndustryPreset {
  id: string;
  name: string;
  description: string;
  /** Complete palette so a fresh profile is coherent out of the box. */
  palette: ShowcasePalette;
  typography: TypographyPresetId;
  hero: HeroVariantDefaults;
  /** Suggested homepage section arrangement (ids from SectionTypeId). */
  sectionOrder: SectionTypeId[];
  /** Controlled product-card variant hint for the storefront renderer. */
  productCardVariant: "default" | "editorial" | "product-first";
  /** Spacing density: comfortable = more whitespace, compact = tighter. */
  density: "comfortable" | "standard" | "compact";
  /** Suggested category presentation labels (OPERATOR GUIDANCE ONLY —
   *  these never create catalog records). */
  categoryHints: string[];
}

/* Semantic status tokens are IDENTICAL in every palette (functional
 * signals, never re-tinted to a brand hue) — mirrors backend policy. */
const SEMANTIC = {
  stateSuccess: "#16A34A",
  stateWarning: "#D97706",
  stateDanger: "#DC2626",
  stateInfo: "#2563EB",
} as const;

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  /* ── A. Home Decor & Interior Living ─────────────────────── */
  {
    id: "home-decor",
    name: "Home Decor & Interior Living",
    description:
      "Warm, natural and premium — cream backgrounds, earthy neutrals, muted green/terracotta accents and spacious editorial layouts that let product photography lead.",
    palette: {
      brandNavy: "#3E4A3D",
      brandNavyDeep: "#2C352C",
      brandNavySoft: "#55624F",
      brandGold: "#B4653B",
      brandGoldStrong: "#9E5330",
      brandGoldHover: "#8A4527",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FAF6F0",
      surfaceMuted: "#F1E9DD",
      line: "#E4D9C8",
      lineSoft: "#F1E8DA",
      ink: "#2A241C",
      inkMuted: "#7A6B58",
      inkSubtle: "#A89A87",
      ...SEMANTIC,
    },
    typography: "classic-serif",
    hero: {
      variant: "editorial",
      headingHint: "A short, calm statement about home and comfort",
      subheadingHint: "One line on craftsmanship, materials or curation",
      primaryCtaHint: "Shop the Collection",
      imageHint:
        "Large lifestyle hero — a styled living space in warm natural light",
    },
    sectionOrder: [
      "hero",
      "featuredCategories",
      "featuredProducts",
      "brandIntro",
      "trustRow",
    ],
    productCardVariant: "editorial",
    density: "comfortable",
    categoryHints: [
      "Living Room",
      "Bedroom",
      "Wall Decor",
      "Lighting",
      "Cushions",
      "Decorative Accessories",
    ],
  },

  /* ── B. Women's Fashion ──────────────────────────────────── */
  {
    id: "womens-fashion",
    name: "Women's Fashion",
    description:
      "Contemporary fashion editorial — refined neutrals, elegant typography, campaign-style imagery and structured collection sections.",
    palette: {
      brandNavy: "#2B2A33",
      brandNavyDeep: "#1E1D25",
      brandNavySoft: "#46444F",
      brandGold: "#B98A64",
      brandGoldStrong: "#A67650",
      brandGoldHover: "#8F6343",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FAF8F7",
      surfaceMuted: "#F3EEEA",
      line: "#E8DFD8",
      lineSoft: "#F4EDE8",
      ink: "#241F1C",
      inkMuted: "#756B64",
      inkSubtle: "#A29891",
      ...SEMANTIC,
    },
    typography: "editorial",
    hero: {
      variant: "editorial",
      headingHint: "The name of the current collection or season",
      subheadingHint: "One elegant line about the collection's mood",
      primaryCtaHint: "Explore Collection",
      imageHint:
        "Editorial campaign imagery — model or flat-lay, clean backdrop",
    },
    sectionOrder: [
      "hero",
      "featuredCategories",
      "featuredProducts",
      "promoBanner",
      "trustRow",
    ],
    productCardVariant: "editorial",
    density: "standard",
    categoryHints: [
      "New Arrivals",
      "Clothing",
      "Modest Fashion",
      "Accessories",
      "Seasonal Collections",
    ],
  },

  /* ── C. Footwear ─────────────────────────────────────────── */
  {
    id: "footwear",
    name: "Footwear",
    description:
      "Product-first composition — confident typography, strong product image hierarchy, organized size/color presentation and clear pricing.",
    palette: {
      brandNavy: "#1C1F26",
      brandNavyDeep: "#12141A",
      brandNavySoft: "#31353F",
      brandGold: "#C4552F",
      brandGoldStrong: "#AB4626",
      brandGoldHover: "#933A20",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F7F7F8",
      surfaceMuted: "#EFEFF1",
      line: "#E2E2E6",
      lineSoft: "#F0F0F2",
      ink: "#15171C",
      inkMuted: "#63656E",
      inkSubtle: "#93959D",
      ...SEMANTIC,
    },
    typography: "modern-sans",
    hero: {
      variant: "split",
      headingHint: "A confident one-liner about the flagship pair or drop",
      subheadingHint: "Style, comfort or occasion — one line",
      primaryCtaHint: "Shop Footwear",
      imageHint: "Hero product shot, single pair, strong shadow/contrast",
    },
    sectionOrder: [
      "hero",
      "featuredCategories",
      "featuredProducts",
      "reviewSummary",
      "trustRow",
    ],
    productCardVariant: "product-first",
    density: "standard",
    categoryHints: ["Sneakers", "Formal", "Sandals", "Kids", "New Drops"],
  },

  /* ── D. Beauty & Personal Care ───────────────────────────── */
  {
    id: "beauty",
    name: "Beauty & Personal Care",
    description:
      "Clean, sophisticated layout — balanced soft accents, clear benefit presentation and elegant product detail layouts.",
    palette: {
      brandNavy: "#3A2E35",
      brandNavyDeep: "#2A2128",
      brandNavySoft: "#554451",
      brandGold: "#C97B84",
      brandGoldStrong: "#B5646E",
      brandGoldHover: "#9E525C",
      surfaceCard: "#FFFFFF",
      surfacePage: "#FCF9F9",
      surfaceMuted: "#F6EFEF",
      line: "#EDDFE1",
      lineSoft: "#F7EFF0",
      ink: "#2B2226",
      inkMuted: "#7C6B71",
      inkSubtle: "#A99AA0",
      ...SEMANTIC,
    },
    typography: "minimal",
    hero: {
      variant: "split",
      headingHint: "A gentle line about care, glow or routine",
      subheadingHint: "Ingredient honesty or ritual — one line, no medical claims",
      primaryCtaHint: "Shop Care",
      imageHint: "Soft-lit product still life or clean texture close-up",
    },
    sectionOrder: [
      "hero",
      "featuredCategories",
      "featuredProducts",
      "brandIntro",
      "reviewSummary",
    ],
    productCardVariant: "default",
    density: "comfortable",
    categoryHints: ["Skincare", "Body Care", "Hair Care", "Kits & Sets"],
  },

  /* ── E. Customized Products ──────────────────────────────── */
  {
    id: "customized",
    name: "Customized Products",
    description:
      "Customization-centered discovery — preview-oriented layouts, strong product imagery and clear paths into the existing print/customization flow.",
    palette: {
      brandNavy: "#232B3A",
      brandNavyDeep: "#171D28",
      brandNavySoft: "#3A4557",
      brandGold: "#3E8AAE",
      brandGoldStrong: "#2F7392",
      brandGoldHover: "#275F79",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F7FAFB",
      surfaceMuted: "#EEF4F6",
      line: "#DDE8EC",
      lineSoft: "#EDF4F6",
      ink: "#182029",
      inkMuted: "#5F6E79",
      inkSubtle: "#8E9CA6",
      ...SEMANTIC,
    },
    typography: "modern-sans",
    hero: {
      variant: "split",
      headingHint: "Make it yours — personalization promise in a few words",
      subheadingHint: "What can be customized, in one line",
      primaryCtaHint: "Start Customizing",
      imageHint: "A hero customizable product with visible personalization",
    },
    sectionOrder: [
      "hero",
      "featuredProducts",
      "featuredCategories",
      "trustRow",
      "reviewSummary",
    ],
    productCardVariant: "product-first",
    density: "standard",
    categoryHints: [
      "Custom Mugs",
      "Personalized Apparel",
      "Gifts",
      "Photo Products",
    ],
  },

  /* ── F. General Premium E-Commerce ───────────────────────── */
  {
    id: "general",
    name: "General Premium E-Commerce",
    description:
      "A flexible, commercially credible default — balanced neutrals with a confident accent, suited to any retail catalog.",
    palette: {
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
    typography: "modern-sans",
    hero: {
      variant: "full",
      headingHint: "What the store offers, in one confident line",
      subheadingHint: "Quality, delivery or value — one supporting line",
      primaryCtaHint: "Shop Now",
      imageHint: "Brand banner or hero product with room for text overlay",
    },
    sectionOrder: [
      "hero",
      "featuredCategories",
      "featuredProducts",
      "trustRow",
      "reviewSummary",
    ],
    productCardVariant: "default",
    density: "standard",
    categoryHints: ["Best Sellers", "New Arrivals", "Collections"],
  },

  /* ── G. Custom (blank starting point) ────────────────────── */
  {
    id: "custom",
    name: "Custom",
    description:
      "A neutral starting point — the platform's classic identity with no industry assumptions. Configure every detail manually.",
    palette: {
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
    typography: "modern-sans",
    hero: {
      variant: "full",
      headingHint: "Write your own headline",
      subheadingHint: "Write your own supporting line",
      primaryCtaHint: "Shop Now",
      imageHint: "Upload your own hero image (desktop + mobile variants)",
    },
    sectionOrder: ["hero", "featuredProducts", "trustRow"],
    productCardVariant: "default",
    density: "standard",
    categoryHints: [],
  },
];

/** Typographic display metadata for previews/editors. */
export const TYPOGRAPHY_OPTIONS: Record<
  TypographyPresetId,
  { label: string; headingFont: string; bodyFont: string; note: string }
> = {
  "classic-serif": {
    label: "Classic Serif",
    headingFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "system-ui, sans-serif",
    note: "Refined and heritage — suits decor, luxury and editorial brands",
  },
  "modern-sans": {
    label: "Modern Sans",
    headingFont: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    bodyFont: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    note: "Clean and versatile — the safe premium default",
  },
  editorial: {
    label: "Editorial",
    headingFont: "'Playfair Display', Georgia, serif",
    bodyFont: "system-ui, sans-serif",
    note: "Fashion-magazine contrast for collection-led brands",
  },
  minimal: {
    label: "Minimal",
    headingFont: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    bodyFont: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    note: "Understated and spacious — beauty, wellness, boutique",
  },
};

/* ── lookup helpers ─────────────────────────────────────────── */

// Ids derived from the preset objects themselves — the create-modal and the
// editor can only offer what findIndustryPreset() can resolve. Parity with
// the canonical shared/industryPresetIds.json is enforced by the backend
// parity test (F-06/F-10).
export const INDUSTRY_PRESET_IDS = INDUSTRY_PRESETS.map((p) => p.id);

export const findIndustryPreset = (id: string): IndustryPreset =>
  INDUSTRY_PRESETS.find((p) => p.id === id) ||
  INDUSTRY_PRESETS.find((p) => p.id === "general")!;
