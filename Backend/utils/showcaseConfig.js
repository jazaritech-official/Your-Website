/**
 * ============================================================
 * SHOWCASE (BRAND PROFILE) CONFIG — CANONICAL VALIDATION
 * ------------------------------------------------------------
 * Single source of truth on the backend for:
 *   • the canonical INDUSTRY PRESET id list (static design
 *     directions — presentation defaults only, never catalog data)
 *   • the HOMEPAGE SECTION type registry (controlled component
 *     registry — the storefront only renders types listed here)
 *   • sanitizeShowcaseConfig(): a strict whitelist-based sanitizer
 *     for every persisted showcase configuration
 *
 * SECURITY CONTRACT
 * Everything that reaches MongoDB or a public response goes through
 * this sanitizer first. It:
 *   - drops unknown keys (never trusts the client shape),
 *   - validates every colour against the same strict hex regex the
 *     theme system uses,
 *   - validates external URLs (http/https only — javascript: and
 *     data: are rejected) and allows internal app routes ("/..."),
 *   - caps every string and array length,
 *   - caps referenced product/category ObjectIds and lets the
 *     controller resolve them against the REAL catalog (a showcase
 *     can only FEATURE real products — it can never create them).
 *
 * NOTE ON PRESET IDS
 * The full visual preset library (palettes, typography, layout
 * defaults) lives in the frontend at
 * `Frontend/src/config/industryPresets.ts` per the architecture —
 * presets are static design configuration, not database records.
 * The backend mirrors only the ID LIST here for validation. If you
 * add a preset to the frontend library you MUST add its id here too
 * (guarded by Backend/__tests__/showcaseConfig.test.js on this side,
 * and by the shared comment contract on the frontend side).
 * ============================================================
 */

import mongoose from "mongoose";
import {
  THEME_COLOR_KEYS,
  isValidHexColor,
  SEMANTIC_COLOR_KEYS,
  meetsSemanticContrast,
} from "./themeDefaults.js";

/**
 * Canonical industry preset ids (the backend validation registry).
 * Contract (F-06/F-10): identical to shared/industryPresetIds.json AND to
 * the ids offered by the frontend preset library
 * (Frontend/src/config/industryPresets.ts). Enforced by
 * Backend/__tests__/industryPresetParity.test.js, which FAILS on any drift.
 */
export const INDUSTRY_PRESET_IDS = [
  "general", // General Premium E-Commerce (flexible default)
  "home-decor", // Home Decor & Interior Living
  "womens-fashion", // Women's Fashion
  "footwear", // Footwear
  "beauty", // Beauty & Personal Care
  "customized", // Customized Products
  "custom", // Custom (blank / manual)
];

/** Profile lifecycle. A draft never serves the public storefront. */
// Lifecycle: draft → published → archived. The legacy "preview" value was
// never a real workflow (draft previews are served through the authenticated
// preview-config endpoint, not a status). Old documents that still carry it
// are normalized to "draft" on save (model pre-validate hook) and on admin
// read (toAdminShape) — F-09.
export const SHOWCASE_STATUSES = ["draft", "published", "archived"];

/** Controlled homepage-section registry. */
export const SECTION_TYPES = [
  "hero", // brand hero (image + headline + CTAs)
  "featuredCategories", // real categories, operator-selected
  "featuredProducts", // real products, operator-selected
  "categoryRow", // one category's products in a row
  "promoBanner", // single promotional image + copy
  "brandIntro", // editorial text block
  "trustRow", // trust/benefit chips
  "reviewSummary", // review count/rating summary (real data only)
];

/** Approved typography presets (font pairing tokens, not free text). */
export const TYPOGRAPHY_PRESETS = [
  "classic-serif",
  "modern-sans",
  "editorial",
  "minimal",
];

export const MAX_SECTIONS = 12;
const MAX_IDS_PER_SECTION = 24;
const MAX_SOCIAL_LINKS = 8;
const HEX = isValidHexColor;

/* ── helpers ─────────────────────────────────────────────────── */

const str = (v, max, fallback = "") => {
  if (typeof v !== "string") return fallback;
  return v.trim().slice(0, max);
};

const bool = (v, fallback = false) =>
  typeof v === "boolean" ? v : fallback;

/**
 * Safe link validation.
 *  - internal routes: must start with a single "/" (no "//host" — that
 *    would be a protocol-relative external URL),
 *  - external: http/https only, length-capped.
 * Everything else becomes the fallback (empty string).
 */
export const isSafeLink = (value) => {
  const v = str(value, 500);
  if (!v) return false;
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) {
    return /^\/[^\s'"<>\\]*$/.test(v);
  }
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const safeLink = (v, fallback = "") => (isSafeLink(v) ? str(v, 500) : fallback);

/** Cloudinary-hosted asset URLs only for uploaded brand imagery. */
const safeImageUrl = (v) => {
  const url = str(v, 1000);
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "";
    return /(^|\.)cloudinary\.com$/.test(u.hostname) ? url : "";
  } catch {
    return "";
  }
};

const objectIdList = (v) => {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const item of v) {
    const id = String(item || "");
    if (mongoose.isValidObjectId(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_IDS_PER_SECTION) break;
    }
  }
  return out;
};

/* ── section sanitizer ───────────────────────────────────────── */

/**
 * Content-completeness rules per section type. A section kept without these
 * essentials would render as an empty band on the storefront — but dropping
 * it silently would destroy the operator's work. Contract (F-03): incomplete
 * sections are KEPT in the draft and reported as INCOMPLETE_SECTION warnings
 * that block publish until fixed (or the section is hidden/removed).
 * Hidden sections (visible === false) are exempt — they render nothing.
 */
const SECTION_INCOMPLETE_RULES = {
  hero: (s) => !s.heading && !s.image,
  featuredCategories: (s) => s.categoryIds.length === 0 && !s.image,
  categoryRow: (s) => s.categoryIds.length === 0 && !s.image,
  featuredProducts: (s) => s.productIds.length === 0 && !s.image,
  promoBanner: (s) => !s.heading && !s.image,
};

const SECTION_INCOMPLETE_HINTS = {
  hero: "a heading or an image",
  featuredCategories: "at least one category or an image",
  categoryRow: "at least one category or an image",
  featuredProducts: "at least one product or an image",
  promoBanner: "a heading or an image",
};

/**
 * Closed-set presentation variants per section type (F-variant). The
 * storefront renderer maps these names to known CSS-class sets — never
 * arbitrary CSS — and unknown values fall back to "default" with an
 * INVALID_VALUE warning. Types not listed here have only "default".
 * (The hero preset's `variant` is a separate hero-config concept.)
 */
export const SECTION_VARIANTS = {
  featuredProducts: ["default", "compact", "scroll"],
  featuredCategories: ["default", "compact"],
  categoryRow: ["default", "compact"],
  promoBanner: ["default", "centered"],
};

const sanitizeSection = (raw) => {
  if (!raw || typeof raw !== "object")
    return { ok: false, reason: "not an object" };
  if (!SECTION_TYPES.includes(raw.type))
    return {
      ok: false,
      reason: `unknown section type "${String(raw.type).slice(0, 40)}"`,
    };

  const id = str(raw.id, 60) || `sec_${Math.random().toString(36).slice(2, 10)}`;

  const section = {
    id,
    type: raw.type,
    visible: bool(raw.visible, true),
    variant: str(raw.variant, 40, "default"),
    heading: str(raw.heading, 120),
    subtitle: str(raw.subtitle, 240),
    image: safeImageUrl(raw.image),
    imageMobile: safeImageUrl(raw.imageMobile),
    ctaLabel: str(raw.ctaLabel, 60),
    ctaHref: safeLink(raw.ctaHref),
    categoryIds: objectIdList(raw.categoryIds),
    productIds: objectIdList(raw.productIds),
  };

  // Closed-set variant whitelist — types without variants are pinned to
  // "default"; unknown values for typed variants fall back too (flagged).
  const variantList = SECTION_VARIANTS[section.type];
  let variantInvalid = false;
  if (!variantList) {
    section.variant = "default";
  } else if (!variantList.includes(section.variant)) {
    section.variant = "default";
    variantInvalid = true;
  }

  const incompleteRule = SECTION_INCOMPLETE_RULES[section.type];
  const incomplete =
    section.visible && incompleteRule?.(section)
      ? SECTION_INCOMPLETE_HINTS[section.type]
      : null;
  return { ok: true, section, incomplete, variantInvalid };
};

/* ── full config sanitizer ───────────────────────────────────── */

/**
 * Sanitize an incoming showcase configuration.
 * @returns {{ ok: boolean, errors: string[], warnings: Array<{path: string, code: string, message: string}>, value: object }}
 * Never throws. Unknown keys are dropped, invalid values fall back to
 * safe defaults, and the caller receives a fully-shaped config.
 *
 * `errors` is the legacy fatal-ish list (bad brand name, invalid values that
 * were coerced). `warnings` is the structured, non-fatal contract (F-03):
 * every entry names the path, a machine code and a human message so the
 * editor can show exactly what was adjusted or needs attention. Codes:
 *   REQUIRED           – missing required field (blocks publish)
 *   INCOMPLETE_SECTION – kept but incomplete section (blocks publish)
 *   SECTION_DROPPED    – unrecognised section removed (also in errors)
 *   SECTION_TRUNCATED  – sections over the cap were dropped
 *   INVALID_VALUE      – a supplied value was rejected/coerced
 */
export function sanitizeShowcaseConfig(raw) {
  const errors = [];
  const warnings = [];
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  /* Identity */
  const brandName = str(input.brandName, 80);
  if (!brandName) {
    errors.push("brandName is required");
    warnings.push({
      path: "brandName",
      code: "REQUIRED",
      message: "Brand name is required before publishing",
    });
  }
  const tagline = str(input.tagline, 160);
  const logoUrl = safeImageUrl(input.logoUrl);
  const logoPublicId = str(input.logoPublicId, 200);
  const faviconUrl = safeImageUrl(input.faviconUrl);
  const faviconPublicId = str(input.faviconPublicId, 200);
  if (input.logoUrl && !logoUrl)
    warnings.push({
      path: "logoUrl",
      code: "INVALID_VALUE",
      message: "Logo URL was rejected — only Cloudinary image URLs are allowed",
    });
  if (input.faviconUrl && !faviconUrl)
    warnings.push({
      path: "faviconUrl",
      code: "INVALID_VALUE",
      message: "Favicon URL was rejected — only Cloudinary image URLs are allowed",
    });
  const seoTitle = str(input.seoTitle, 70);
  const seoDescription = str(input.seoDescription, 170);
  // Public indexing control — default false (demo storefronts are noindex
  // until the operator explicitly opts in).
  const seoIndexable = bool(input.seoIndexable, false);

  /* Industry preset */
  const industry = INDUSTRY_PRESET_IDS.includes(input.industry)
    ? input.industry
    : "general";
  if (input.industry && !INDUSTRY_PRESET_IDS.includes(input.industry)) {
    const msg = `Unknown industry preset: ${String(input.industry).slice(0, 40)}`;
    errors.push(msg);
    warnings.push({ path: "industry", code: "INVALID_VALUE", message: msg });
  }

  /* Theme — partial colour overrides validated per token */
  const theme = { colors: {}, typography: "modern-sans" };
  const rawColors =
    input.theme && typeof input.theme.colors === "object" && !Array.isArray(input.theme.colors)
      ? input.theme.colors
      : {};
  for (const [key, value] of Object.entries(rawColors)) {
    if (!THEME_COLOR_KEYS.includes(key)) {
      // Drop unknown tokens — report so nothing disappears silently.
      warnings.push({
        path: `theme.colors.${key}`,
        code: "INVALID_VALUE",
        message: `Unknown theme token "${key}" was dropped`,
      });
      continue;
    }
    if (!HEX(value)) {
      const msg = `theme.colors.${key} must be a valid hex colour`;
      errors.push(msg);
      warnings.push({ path: `theme.colors.${key}`, code: "INVALID_VALUE", message: msg });
      continue;
    }
    // F-11: semantic status tokens are accepted but must stay accessible —
    // minimum 3:1 contrast against white (same rule as the theme editor).
    if (SEMANTIC_COLOR_KEYS.includes(key) && !meetsSemanticContrast(value)) {
      const msg = `theme.colors.${key} must keep at least 3:1 contrast against white (accessible status colour)`;
      errors.push(msg);
      warnings.push({ path: `theme.colors.${key}`, code: "INVALID_VALUE", message: msg });
      continue;
    }
    theme.colors[key] = String(value).trim();
  }
  const typo =
    input.theme && TYPOGRAPHY_PRESETS.includes(input.theme.typography)
      ? input.theme.typography
      : "modern-sans";
  if (input.theme?.typography && !TYPOGRAPHY_PRESETS.includes(input.theme.typography)) {
    const msg = `Unknown typography preset: ${String(input.theme.typography).slice(0, 40)}`;
    errors.push(msg);
    warnings.push({ path: "theme.typography", code: "INVALID_VALUE", message: msg });
  }
  theme.typography = typo;

  /* Hero */
  const rawHero = input.hero && typeof input.hero === "object" ? input.hero : {};
  const hero = {
    image: safeImageUrl(rawHero.image),
    imageMobile: safeImageUrl(rawHero.imageMobile),
    heading: str(rawHero.heading, 120),
    subheading: str(rawHero.subheading, 300),
    primaryCta: {
      label: str(rawHero.primaryCta?.label, 40),
      href: safeLink(rawHero.primaryCta?.href, "/productsPage"),
    },
    secondaryCta: {
      label: str(rawHero.secondaryCta?.label, 40),
      href: safeLink(rawHero.secondaryCta?.href),
    },
  };
  if (rawHero.image && !hero.image)
    warnings.push({
      path: "hero.image",
      code: "INVALID_VALUE",
      message: "Hero image was rejected — only Cloudinary image URLs are allowed",
    });
  if (rawHero.primaryCta?.href && !isSafeLink(rawHero.primaryCta.href))
    warnings.push({
      path: "hero.primaryCta.href",
      code: "INVALID_VALUE",
      message: "Hero button link was rejected (unsafe protocol) — using the default link",
    });
  if (rawHero.secondaryCta?.href && !isSafeLink(rawHero.secondaryCta.href))
    warnings.push({
      path: "hero.secondaryCta.href",
      code: "INVALID_VALUE",
      message: "Hero secondary link was rejected (unsafe protocol) and was removed",
    });

  /* Homepage sections */
  const sections = [];
  if (Array.isArray(input.sections)) {
    input.sections.slice(0, MAX_SECTIONS).forEach((rawSection, i) => {
      const res = sanitizeSection(rawSection);
      if (!res.ok) {
        const message = `Section ${i + 1} dropped: ${res.reason}`;
        errors.push(message);
        warnings.push({ path: `sections[${i}]`, code: "SECTION_DROPPED", message });
        return;
      }
      if (rawSection?.image && !res.section.image)
        warnings.push({
          path: `sections[${i}].image`,
          code: "INVALID_VALUE",
          message: `Section ${i + 1} image was rejected — only Cloudinary image URLs are allowed`,
        });
      if (res.variantInvalid)
        warnings.push({
          path: `sections[${i}].variant`,
          code: "INVALID_VALUE",
          message: `Section ${i + 1} variant was reset to \"default\" — only closed-set variants are allowed`,
        });
      if (rawSection?.ctaHref && !res.section.ctaHref)
        warnings.push({
          path: `sections[${i}].ctaHref`,
          code: "INVALID_VALUE",
          message: `Section ${i + 1} link was rejected — only safe relative or https links are allowed`,
        });
      sections.push(res.section);
      if (res.incomplete) {
        warnings.push({
          path: `sections[${i}]`,
          code: "INCOMPLETE_SECTION",
          message: `Section ${i + 1} ("${res.section.type}") still needs ${res.incomplete} before it can be published`,
        });
      }
    });
    if (input.sections.length > MAX_SECTIONS) {
      warnings.push({
        path: "sections",
        code: "SECTION_TRUNCATED",
        message: `Only the first ${MAX_SECTIONS} sections are kept — ${input.sections.length - MAX_SECTIONS} were dropped`,
      });
    }
  }

  /* Category presentation — ordering of REAL categories */
  const categoryOrder = objectIdList(input.categoryOrder);

  /* Contact */
  const rawContact =
    input.contact && typeof input.contact === "object" ? input.contact : {};
  const social = {};
  if (rawContact.social && typeof rawContact.social === "object") {
    let count = 0;
    for (const [network, url] of Object.entries(rawContact.social)) {
      if (count >= MAX_SOCIAL_LINKS) break;
      if (!/^[a-zA-Z0-9_-]{1,24}$/.test(String(network))) continue;
      if (!isSafeLink(url)) {
        if (url)
          warnings.push({
            path: `contact.social.${network}`,
            code: "INVALID_VALUE",
            message: `Social link for "${network}" was rejected (unsafe protocol) and was removed`,
          });
        continue;
      }
      social[network.toLowerCase()] = safeLink(url);
      count++;
    }
  }
  const contact = {
    address: str(rawContact.address, 240),
    phone: str(rawContact.phone, 40),
    email: str(rawContact.email, 120),
    whatsapp: str(rawContact.whatsapp, 40),
    social,
  };
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    const msg = "contact.email must be a valid email address";
    errors.push(msg);
    warnings.push({ path: "contact.email", code: "INVALID_VALUE", message: msg });
    contact.email = "";
  }

  /* Footer */
  const rawFooter = input.footer && typeof input.footer === "object" ? input.footer : {};
  const footer = {
    description: str(rawFooter.description, 400),
    poweredBy: bool(rawFooter.poweredBy, true),
  };

  /* Preview watermark (demo label) */
  const previewWatermark = bool(input.previewWatermark, false);
  const watermarkText = str(input.watermarkText, 80, "Prepared by Jazari Tech Official");

  const value = {
    brandName,
    tagline,
    logoUrl,
    logoPublicId,
    faviconUrl,
    faviconPublicId,
    seoTitle,
    seoDescription,
    seoIndexable,
    industry,
    theme,
    hero,
    sections,
    categoryOrder,
    contact,
    footer,
    previewWatermark,
    watermarkText,
  };

  return { ok: errors.length === 0, errors, warnings, value };
}

/** Slug rules: lowercase, url-safe, 3–60 chars, no leading/trailing dash. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_REGEX.test(slug) && slug.length <= 60;
}

/**
 * Derive a URL-safe slug from a display name (used as a fallback when the
 * operator does not supply one). Never returns an invalid slug.
 */
export function slugify(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return base;
}
