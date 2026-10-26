/**
 * Pure Showcase Studio logic — unit-tested with Vitest, no React or browser
 * involved. Mirrors of backend rules live here ONLY where the editor needs
 * instant feedback; the backend (Backend/utils/showcaseConfig.js) remains
 * the authority and its rules are the contract (keep in sync).
 */
import type { StudioSection } from "./types";

/* ── F-03: incomplete-section validation ─────────────────────────────── */

export interface SectionIssue {
  index: number;
  id: string;
  type: string;
  message: string;
}

/** Mirror of the backend's SECTION_INCOMPLETE_RULES + hints. */
const INCOMPLETE_RULES: Record<
  string,
  { hint: string; test: (s: StudioSection) => boolean }
> = {
  hero: { hint: "a heading or an image", test: (s) => !s.heading.trim() && !s.image },
  featuredCategories: {
    hint: "at least one category or an image",
    test: (s) => s.categoryIds.length === 0 && !s.image,
  },
  categoryRow: {
    hint: "at least one category or an image",
    test: (s) => s.categoryIds.length === 0 && !s.image,
  },
  featuredProducts: {
    hint: "at least one product or an image",
    test: (s) => s.productIds.length === 0 && !s.image,
  },
  promoBanner: { hint: "a heading or an image", test: (s) => !s.heading.trim() && !s.image },
};

/**
 * Message describing what the section still needs before it can publish,
 * or null when it is fine. Hidden sections render nothing and are exempt
 * (mirrors the backend rule exactly).
 */
export const sectionIssue = (s: StudioSection): string | null => {
  if (s.visible === false) return null;
  const rule = INCOMPLETE_RULES[s.type];
  if (!rule || !rule.test(s)) return null;
  return rule.hint;
};

/** All incomplete-section issues with their positions (for banners/pre-checks). */
export const validateShowcaseSections = (
  sections: StudioSection[],
): SectionIssue[] =>
  sections.flatMap((s, index) => {
    const hint = sectionIssue(s);
    return hint
      ? [{ index, id: s.id, type: s.type, message: `Needs ${hint} before publishing` }]
      : [];
  });

/* ── F-variant: closed-set section variants (editor-side option lists) ──
 * Mirror of backend SECTION_VARIANTS — unknown values fall back to
 * "default" in the sanitizer. The storefront renderer maps each value to
 * a known CSS-class set; never arbitrary CSS. */

export const SECTION_VARIANT_OPTIONS: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  featuredProducts: [
    { value: "default", label: "Grid (default)" },
    { value: "compact", label: "Compact grid" },
    { value: "scroll", label: "Horizontal scroll row" },
  ],
  featuredCategories: [
    { value: "default", label: "Tiles (default)" },
    { value: "compact", label: "Compact tiles" },
  ],
  categoryRow: [
    { value: "default", label: "Tiles (default)" },
    { value: "compact", label: "Compact tiles" },
  ],
  promoBanner: [
    { value: "default", label: "Left-aligned (default)" },
    { value: "centered", label: "Centered" },
  ],
};

/* ── F-presets: apply a suggested section order without losing content ── */

/**
 * Apply a preset's suggested homepage section order.
 *
 * Rules (never violated):
 *  • Existing sections and their content are NEVER deleted or edited — the
 *    function only reorders, and sections whose type is not in the
 *    suggestion keep their relative order at the end.
 *  • When the profile has no sections yet, EMPTY-but-valid placeholders of
 *    the preset's types are created (via the caller's factory). They are
 *    flagged by the F-03 validation until filled with real catalog picks —
 *    no fake products or categories are ever invented.
 */
export function applySuggestedSectionOrder<T extends { type: string }>(
  existing: T[],
  suggested: string[],
  makePlaceholder: (type: string) => T,
): T[] {
  if (existing.length === 0) {
    return suggested.map((type) => makePlaceholder(type));
  }
  const buckets = new Map<string, T[]>();
  for (const s of existing) {
    const bucket = buckets.get(s.type);
    if (bucket) bucket.push(s);
    else buckets.set(s.type, [s]);
  }
  const out: T[] = [];
  for (const type of suggested) {
    const bucket = buckets.get(type);
    while (bucket && bucket.length) out.push(bucket.shift() as T);
  }
  for (const s of existing) {
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/* ── F-01: dirty-safe merge for asset uploads ────────────────────────── */

export type UploadedAssetKind = "logo" | "favicon";

/**
 * Merge ONLY the fields belonging to the uploaded asset into the local
 * draft config. This is the F-01 guarantee: an asset-upload response never
 * clobbers the whole local config, so unsaved edits elsewhere survive.
 */
export function mergeUploadedAsset<
  T extends {
    logoUrl: string;
    faviconUrl: string;
    logoPublicId?: string;
    faviconPublicId?: string;
  },
>(local: T, kind: UploadedAssetKind, asset: { url: string; publicId?: string }): T {
  return kind === "logo"
    ? { ...local, logoUrl: asset.url, logoPublicId: asset.publicId ?? local.logoPublicId }
    : {
        ...local,
        faviconUrl: asset.url,
        faviconPublicId: asset.publicId ?? local.faviconPublicId,
      };
}

/* ── F-04: profile-level category strip ordering ─────────────────────── */

/** Append ids to the profile category order, deduplicated, preserving the
 *  existing order. (The backend sanitizer re-dedups/caps on save as
 *  defence-in-depth.) */
export const appendCategoryOrder = (current: string[], ids: string[]): string[] => {
  const seen = new Set(current);
  const out = [...current];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};
