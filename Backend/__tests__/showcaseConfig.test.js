/**
 * Showcase (brand profile) configuration sanitizer tests.
 *
 * The risk these guard: an unvalidated showcase config reaching MongoDB or a
 * public response — e.g. a javascript: CTA link, a non-hex colour that breaks
 * a whole CSS variable family, an unknown section type that the storefront
 * would try to render, or a profile referencing thousands of product ids.
 */
import { describe, test, expect } from "@jest/globals";
import {
  INDUSTRY_PRESET_IDS,
  SHOWCASE_STATUSES,
  SECTION_TYPES,
  TYPOGRAPHY_PRESETS,
  sanitizeShowcaseConfig,
  isSafeLink,
  isValidSlug,
  slugify,
} from "../utils/showcaseConfig.js";
import { THEME_COLOR_KEYS, isValidHexColor } from "../utils/themeDefaults.js";
import { PITCH_STATUSES, PITCH_INTERFACES, PITCH_FEATURES } from "../Models/PitchRecord.js";

describe("showcase config — sanitizer contract", () => {
  test("an empty config produces a usable default with a clear error", () => {
    const { ok, errors, value } = sanitizeShowcaseConfig({});
    expect(ok).toBe(false);
    expect(errors).toContain("brandName is required");
    expect(value.industry).toBe("general");
    expect(value.sections).toEqual([]);
    expect(value.theme.typography).toBe("modern-sans");
  });

  test("unknown top-level keys are dropped (never persisted)", () => {
    const { value } = sanitizeShowcaseConfig({
      brandName: "Anzara Studio",
      isAdmin: true,
      role: "superadmin",
      __proto__: { polluted: true },
    });
    expect(value.isAdmin).toBeUndefined();
    expect(value.role).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(value, "isAdmin")).toBe(false);
  });

  test("valid hex colours on registry tokens survive; invalid ones are rejected", () => {
    const { errors, value } = sanitizeShowcaseConfig({
      brandName: "X",
      theme: {
        colors: {
          brandGold: "#C8A84E",
          surfaceCard: "not-a-color",
          notARegistryToken: "#FFFFFF",
        },
      },
    });
    expect(value.theme.colors.brandGold).toBe("#C8A84E");
    expect(value.theme.colors.surfaceCard).toBeUndefined();
    // Unknown token keys are silently dropped, invalid known tokens error.
    expect(value.theme.colors.notARegistryToken).toBeUndefined();
    expect(errors.some((e) => e.includes("surfaceCard"))).toBe(true);
    for (const [k, v] of Object.entries(value.theme.colors)) {
      expect(THEME_COLOR_KEYS).toContain(k);
      expect(isValidHexColor(v)).toBe(true);
    }
  });

  test("unsafe CTA links are rejected; internal routes and https pass", () => {
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      hero: {
        heading: "Welcome",
        primaryCta: { label: "Bad", href: "javascript:alert(1)" },
        secondaryCta: { label: "Good", href: "/productsPage" },
      },
    });
    expect(value.hero.primaryCta.href).toBe("/productsPage"); // falls back
    expect(value.hero.secondaryCta.href).toBe("/productsPage");

    expect(isSafeLink("https://instagram.com/brand")).toBe(true);
    expect(isSafeLink("http://example.com")).toBe(true);
    expect(isSafeLink("//evil.com")).toBe(false);
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("data:text/html,<script>")).toBe(false);
  });

  test("social links keep only safe https/http URLs under valid network keys", () => {
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      contact: {
        email: "hello@brand.com",
        social: {
          Facebook: "https://facebook.com/brand",
          Instagram: "javascript:alert(1)",
          "bad key!": "https://ok.com",
        },
      },
    });
    expect(value.contact.social.facebook).toBe("https://facebook.com/brand");
    expect(value.contact.social.instagram).toBeUndefined();
    expect(value.contact.email).toBe("hello@brand.com");
  });

  test("invalid email is rejected with an error and cleared", () => {
    const { errors, value } = sanitizeShowcaseConfig({
      brandName: "X",
      contact: { email: "not-an-email" },
    });
    expect(errors.some((e) => e.includes("contact.email"))).toBe(true);
    expect(value.contact.email).toBe("");
  });

  test("unknown section types are dropped; sections are capped", () => {
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      sections: [
        { type: "eval-inject", heading: "nope" },
        ...Array.from({ length: 20 }, (_, i) => ({
          type: "brandIntro",
          heading: `Section ${i}`,
        })),
      ],
    });
    expect(value.sections.length).toBeLessThanOrEqual(12);
    expect(value.sections.every((s) => SECTION_TYPES.includes(s.type))).toBe(true);
  });

  test("an incomplete hero section is KEPT and reported, not silently dropped (F-03)", () => {
    const { value, warnings } = sanitizeShowcaseConfig({
      brandName: "X",
      sections: [
        { type: "hero", heading: "", image: "" },
        { type: "hero", heading: "Real hero" },
      ],
    });
    expect(value.sections.length).toBe(2);
    expect(value.sections[1].heading).toBe("Real hero");
    const incomplete = warnings.filter((w) => w.code === "INCOMPLETE_SECTION");
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0].path).toBe("sections[0]");
    expect(incomplete[0].message).toContain("hero");
  });

  describe("warnings contract (F-03)", () => {
    test("a complete configuration produces zero warnings", () => {
      const { warnings, ok } = sanitizeShowcaseConfig({
        brandName: "X",
        hero: { heading: "Hi" },
        sections: [
          { type: "hero", heading: "Hi" },
          { type: "featuredProducts", productIds: ["507f1f77bcf86cd799439011"] },
        ],
      });
      expect(ok).toBe(true);
      expect(warnings).toEqual([]);
    });

    test("an empty featuredCategories section is kept and flagged (F-03 acceptance)", () => {
      const { value, warnings, ok } = sanitizeShowcaseConfig({
        brandName: "X",
        sections: [{ type: "featuredCategories", categoryIds: [] }],
      });
      expect(ok).toBe(true); // non-fatal — the draft still saves
      expect(value.sections).toHaveLength(1); // nothing disappears silently
      const w = warnings.find((x) => x.code === "INCOMPLETE_SECTION");
      expect(w).toBeDefined();
      expect(w.path).toBe("sections[0]");
      expect(w.message).toContain("featuredCategories");
      expect(w.message).toContain("category");
    });

    test("hidden incomplete sections are exempt (visible:false renders nothing)", () => {
      const { warnings } = sanitizeShowcaseConfig({
        brandName: "X",
        sections: [{ type: "promoBanner", visible: false }],
      });
      expect(warnings.filter((w) => w.code === "INCOMPLETE_SECTION")).toHaveLength(0);
    });

    test("unknown section types drop WITH a SECTION_DROPPED warning naming the index", () => {
      const { value, warnings, errors } = sanitizeShowcaseConfig({
        brandName: "X",
        sections: [
          { type: "hero", heading: "ok" },
          { type: "eval-inject", heading: "nope" },
        ],
      });
      expect(value.sections).toHaveLength(1);
      const w = warnings.find((x) => x.code === "SECTION_DROPPED");
      expect(w.path).toBe("sections[1]");
      expect(w.message).toContain("unknown section type");
      expect(errors.some((e) => e.includes("unknown section type"))).toBe(true);
    });

    test("over-cap sections raise SECTION_TRUNCATED instead of vanishing", () => {
      const { warnings } = sanitizeShowcaseConfig({
        brandName: "X",
        sections: Array.from({ length: 15 }, (_, i) => ({
          type: "brandIntro",
          heading: `S${i}`,
        })),
      });
      const w = warnings.find((x) => x.code === "SECTION_TRUNCATED");
      expect(w).toBeDefined();
      expect(w.message).toContain("12");
    });

    test("rejected values produce INVALID_VALUE warnings (images, links, colours, email)", () => {
      const { warnings } = sanitizeShowcaseConfig({
        brandName: "X",
        logoUrl: "http://evil.com/logo.png",
        hero: {
          heading: "H",
          primaryCta: { label: "Go", href: "javascript:alert(1)" },
        },
        theme: { colors: { surfaceCard: "not-a-color" } },
        contact: { email: "nope", social: { Instagram: "javascript:x" } },
      });
      const paths = warnings.filter((w) => w.code === "INVALID_VALUE").map((w) => w.path);
      expect(paths).toContain("logoUrl");
      expect(paths).toContain("hero.primaryCta.href");
      expect(paths).toContain("theme.colors.surfaceCard");
      expect(paths).toContain("contact.email");
      expect(paths).toContain("contact.social.Instagram");
    });

    test("seoIndexable defaults to false (noindex) and passes booleans through (public SEO)", () => {
    // Default: demo storefronts must never be indexable unless opted in.
    expect(sanitizeShowcaseConfig({ brandName: "X" }).value.seoIndexable).toBe(false);
    // Garbage coerces to the safe default, never to true.
    expect(
      sanitizeShowcaseConfig({ brandName: "X", seoIndexable: "yes" }).value
        .seoIndexable,
    ).toBe(false);
    expect(
      sanitizeShowcaseConfig({ brandName: "X", seoIndexable: true }).value
        .seoIndexable,
    ).toBe(true);
  });

  test("unknown section variants fall back to \"default\" with a warning (closed set)", () => {
    const { value, warnings } = sanitizeShowcaseConfig({
      brandName: "X",
      sections: [
        { type: "featuredProducts", productIds: ["507f1f77bcf86cd799439011"], variant: "carousel-x" },
        { type: "featuredProducts", productIds: ["507f1f77bcf86cd799439011"], variant: "scroll" },
      ],
    });
    expect(value.sections[0].variant).toBe("default");
    expect(value.sections[1].variant).toBe("scroll"); // known variant survives
    expect(
      warnings.some(
        (w) => w.code === "INVALID_VALUE" && w.path === "sections[0].variant",
      ),
    ).toBe(true);
    expect(
      warnings.some((w) => w.path === "sections[1].variant"),
    ).toBe(false);
  });

  test("section types without variants are pinned to \"default\"", () => {
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      sections: [{ type: "trustRow", variant: "centered" }],
    });
    expect(value.sections[0].variant).toBe("default");
  });

  test("categoryOrder deduplicates, drops invalid ids and caps (F-04)", () => {
    const a = "507f1f77bcf86cd799439011";
    const b = "507f1f77bcf86cd799439012";
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      categoryOrder: [a, a, b, "not-an-id", b, a],
    });
    expect(value.categoryOrder).toEqual([a, b]);
  });

  test("missing brandName raises a REQUIRED warning (publish-blocking code)", () => {
      const { warnings } = sanitizeShowcaseConfig({ brandName: "" });
      expect(warnings.some((w) => w.code === "REQUIRED" && w.path === "brandName")).toBe(true);
    });
  });

  test("product/category references keep only valid ObjectIds, capped", () => {
    const validId = "507f1f77bcf86cd799439011";
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      sections: [
        {
          type: "featuredProducts",
          productIds: [validId, "not-an-id", validId, "123", validId],
        },
      ],
    });
    expect(value.sections[0].productIds).toEqual([validId]);
  });

  test("industry falls back to general on unknown ids", () => {
    const { value, errors } = sanitizeShowcaseConfig({
      brandName: "X",
      industry: "definitely-not-a-preset",
    });
    expect(value.industry).toBe("general");
    expect(errors.some((e) => e.includes("industry"))).toBe(true);
    for (const id of ["home-decor", "womens-fashion", "footwear", "beauty", "customized", "custom", "general"]) {
      expect(INDUSTRY_PRESET_IDS).toContain(id);
    }
  });

  test("logo/hero images must be https Cloudinary URLs", () => {
    const { value } = sanitizeShowcaseConfig({
      brandName: "X",
      logoUrl: "https://res.cloudinary.com/demo/image/upload/logo.png",
      hero: {
        image: "http://evil.com/hero.jpg",
        heading: "H",
      },
    });
    expect(value.logoUrl).toContain("cloudinary.com");
    expect(value.hero.image).toBe(""); // non-https dropped
  });
});

describe("showcase slugs", () => {
  test("valid slugs pass, invalid ones fail", () => {
    expect(isValidSlug("anzara-studio")).toBe(true);
    expect(isValidSlug("a1")).toBe(true);
    expect(isValidSlug("Anzara Studio")).toBe(false); // spaces / uppercase
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("has_underscore")).toBe(false);
  });

  test("slugify derives url-safe slugs", () => {
    expect(slugify("Anzara Studio")).toBe("anzara-studio");
    expect(slugify("  Home & Decor!! ")).toBe("home-decor");
    expect(isValidSlug(slugify("Women's Fashion Showcase"))).toBe(true);
  });
});

describe("pitch record enums", () => {
  test("status lifecycle is internally consistent", () => {
    for (const s of ["draft", "preparing", "ready", "presented", "followup", "won", "lost", "archived"]) {
      expect(PITCH_STATUSES).toContain(s);
    }
    // Pitch statuses must never collide with order statuses semantically —
    // they are an internal sales workflow. "Pending" (an ORDER status) must
    // not exist here.
    expect(PITCH_STATUSES).not.toContain("Pending");
    expect(PITCH_STATUSES).not.toContain("Delivered");
  });

  test("interface and feature whitelists are unique strings", () => {
    expect(new Set(PITCH_INTERFACES).size).toBe(PITCH_INTERFACES.length);
    expect(new Set(PITCH_FEATURES).size).toBe(PITCH_FEATURES.length);
  });
});

describe("showcase lifecycle + section registry sanity", () => {
  test("status lifecycle covers draft→published→archived; preview removed (F-09)", () => {
    for (const s of ["draft", "published", "archived"]) {
      expect(SHOWCASE_STATUSES).toContain(s);
    }
    // "preview" was dead — no workflow ever set it. It must be gone from
    // the registry so filters/labels/enum all agree.
    expect(SHOWCASE_STATUSES).not.toContain("preview");
  });

  test("typography presets are a closed list", () => {
    for (const t of TYPOGRAPHY_PRESETS) {
      expect(typeof t).toBe("string");
    }
  });
});
