/**
 * Pure-function tests for the Showcase Studio logic module.
 *
 * Covers the behaviors the audit demanded as testable units:
 *  • F-03 section validation (mirror of the backend publish-blocking rules)
 *  • preset section-order application (reorder-only, never deletes content;
 *    placeholders only when the profile has no sections)
 *  • F-01 dirty-safe asset-upload merge (never clobbers the whole config)
 *  • F-04 category strip ordering (dedup, append-only)
 */
import { describe, expect, test } from "vitest";
import type { StudioSection } from "./types";
import {
  applySuggestedSectionOrder,
  appendCategoryOrder,
  mergeUploadedAsset,
  sectionIssue,
  validateShowcaseSections,
  SECTION_VARIANT_OPTIONS,
} from "./studioLogic";

const section = (patch: Partial<StudioSection>): StudioSection => ({
  id: `sec_${Math.random().toString(36).slice(2, 8)}`,
  type: "brandIntro",
  visible: true,
  variant: "default",
  heading: "",
  subtitle: "",
  image: "",
  imageMobile: "",
  ctaLabel: "",
  ctaHref: "",
  categoryIds: [],
  productIds: [],
  ...patch,
});

describe("sectionIssue (F-03 mirror)", () => {
  test("incomplete sections name exactly what they need", () => {
    expect(sectionIssue(section({ type: "hero" }))).toBe("a heading or an image");
    expect(sectionIssue(section({ type: "featuredCategories" }))).toBe(
      "at least one category or an image",
    );
    expect(sectionIssue(section({ type: "featuredProducts" }))).toBe(
      "at least one product or an image",
    );
    expect(sectionIssue(section({ type: "promoBanner" }))).toBe(
      "a heading or an image",
    );
  });

  test("complete sections are fine (content OR image satisfies)", () => {
    expect(sectionIssue(section({ type: "hero", heading: "Hi" }))).toBeNull();
    expect(
      sectionIssue(section({ type: "hero", image: "https://res.cloudinary.com/x.png" })),
    ).toBeNull();
    expect(
      sectionIssue(
        section({ type: "featuredProducts", productIds: ["507f1f77bcf86cd799439011"] }),
      ),
    ).toBeNull();
    expect(
      sectionIssue(
        section({ type: "featuredCategories", categoryIds: ["507f1f77bcf86cd799439011"] }),
      ),
    ).toBeNull();
  });

  test("hidden sections are exempt; types without rules are fine", () => {
    expect(sectionIssue(section({ type: "hero", visible: false }))).toBeNull();
    expect(sectionIssue(section({ type: "trustRow" }))).toBeNull();
    // visible defaults to true — undefined must NOT exempt
    expect(
      sectionIssue(section({ type: "hero", visible: undefined as unknown as boolean })),
    ).toBe("a heading or an image");
  });

  test("validateShowcaseSections reports positions and keeps order", () => {
    const sections = [
      section({ type: "hero", heading: "ok" }),
      section({ type: "featuredProducts" }),
      section({ type: "promoBanner" }),
    ];
    const issues = validateShowcaseSections(sections);
    expect(issues.map((i) => i.index)).toEqual([1, 2]);
    expect(issues[0].id).toBe(sections[1].id);
    expect(issues[1].type).toBe("promoBanner");
    expect(issues[1].message).toContain("before publishing");
  });
});

describe("applySuggestedSectionOrder (presets)", () => {
  const makePlaceholder = (type: string) => section({ type });

  test("empty profile → placeholders of the preset's types, in order", () => {
    const out = applySuggestedSectionOrder([], ["hero", "featuredProducts", "trustRow"], makePlaceholder);
    expect(out.map((s) => s.type)).toEqual(["hero", "featuredProducts", "trustRow"]);
    // placeholders are EMPTY but valid — flagged by validation, never fake
    expect(out.every((s) => !s.heading && s.categoryIds.length === 0)).toBe(true);
    expect(sectionIssue(out[1])).toBeTruthy();
  });

  test("existing sections are REORDERED, never deleted or edited", () => {
    const hero = section({ type: "hero", heading: "Keep me" });
    const trust = section({ type: "trustRow" });
    const products = section({
      type: "featuredProducts",
      productIds: ["507f1f77bcf86cd799439011"],
    });
    const out = applySuggestedSectionOrder(
      [trust, hero, products],
      ["hero", "featuredProducts", "trustRow"],
      makePlaceholder,
    );
    expect(out.map((s) => s.type)).toEqual(["hero", "featuredProducts", "trustRow"]);
    // same object identity — content untouched
    expect(out[0]).toBe(hero);
    expect(out[1]).toBe(products);
    expect(out[1].productIds).toEqual(["507f1f77bcf86cd799439011"]);
    expect(out[2]).toBe(trust);
  });

  test("types NOT in the suggestion keep relative order at the end", () => {
    const a = section({ type: "brandIntro", heading: "A" });
    const b = section({ type: "reviewSummary", heading: "B" });
    const hero = section({ type: "hero", heading: "H" });
    const out = applySuggestedSectionOrder(
      [a, b, hero],
      ["hero"],
      makePlaceholder,
    );
    expect(out.map((s) => s.type)).toEqual(["hero", "brandIntro", "reviewSummary"]);
    expect(out[1]).toBe(a);
    expect(out[2]).toBe(b);
  });

  test("duplicate types of the same section survive in original order", () => {
    const p1 = section({ type: "promoBanner", heading: "First" });
    const p2 = section({ type: "promoBanner", heading: "Second" });
    const out = applySuggestedSectionOrder([p1, p2], ["promoBanner"], makePlaceholder);
    expect(out).toEqual([p1, p2]);
  });
});

describe("mergeUploadedAsset (F-01 dirty-state guarantee)", () => {
  const local = {
    logoUrl: "",
    logoPublicId: "old-logo-id",
    faviconUrl: "",
    faviconPublicId: "",
    brandName: "Anzara",
    tagline: "unsaved edit",
  };

  test("logo upload touches ONLY the logo fields (url + public id)", () => {
    const merged = mergeUploadedAsset(local, "logo", {
      url: "https://res.cloudinary.com/logo.png",
      publicId: "irhasinn/Showcase/x/logo/123",
    });
    expect(merged.logoUrl).toBe("https://res.cloudinary.com/logo.png");
    expect(merged.logoPublicId).toBe("irhasinn/Showcase/x/logo/123");
    expect(merged.faviconUrl).toBe("");
    // unsaved edits elsewhere are preserved
    expect(merged.brandName).toBe("Anzara");
    expect(merged.tagline).toBe("unsaved edit");
    // and the original object is untouched (no mutation)
    expect(local.logoUrl).toBe("");
    expect(local.logoPublicId).toBe("old-logo-id");
  });

  test("favicon upload touches ONLY the favicon fields", () => {
    const merged = mergeUploadedAsset(local, "favicon", {
      url: "https://res.cloudinary.com/fav.png",
    });
    expect(merged.faviconUrl).toBe("https://res.cloudinary.com/fav.png");
    expect(merged.logoUrl).toBe("");
    expect(merged.logoPublicId).toBe("old-logo-id");
    expect(merged.brandName).toBe("Anzara");
  });
});

describe("appendCategoryOrder (F-04)", () => {
  test("appends new ids preserving order and deduplicating", () => {
    const a = "507f1f77bcf86cd799439011";
    const b = "507f1f77bcf86cd799439012";
    const c = "507f1f77bcf86cd799439013";
    expect(appendCategoryOrder([a], [b, a, c, b])).toEqual([a, b, c]);
    expect(appendCategoryOrder([], [])).toEqual([]);
    expect(appendCategoryOrder([a], ["", a])).toEqual([a]);
  });
});

describe("SECTION_VARIANT_OPTIONS (closed set)", () => {
  test("every option list starts with the default variant", () => {
    for (const options of Object.values(SECTION_VARIANT_OPTIONS)) {
      expect(options[0]?.value).toBe("default");
      const values = options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
