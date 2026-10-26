import mongoose from "mongoose";
import {
  INDUSTRY_PRESET_IDS,
  SHOWCASE_STATUSES,
  SECTION_TYPES,
  TYPOGRAPHY_PRESETS,
} from "../utils/showcaseConfig.js";

/* ===========================================================
   BRAND SHOWCASE PROFILE
   -----------------------------------------------------------
   One document per client-brand showcase prepared by
   Jazari Tech Official (e.g. "Anzara Studio", "Home Decor
   Showcase"). Holds ONLY presentation configuration — brand
   identity, theme colour overrides, hero copy/imagery,
   homepage section arrangement and contact/footer content.

   HARD SEPARATIONS (by design):
   • `config`      = the DRAFT the operator edits.
   • `publishedConfig` = an independent copy that is served to
     the PUBLIC storefront, and only when status ===
     "published". Draft edits therefore can never leak to
     visitors, and a failed publish can never leave a
     half-published configuration.
   • Catalog data (products/categories) is SHARED with the
   default IRHAS'INN store; a profile merely FEATURE-picks real
   records by id. No tenant field is added to Product/Category/
   Order — see the architecture note in the controller.

   `versions` is a capped in-document snapshot history of
   published configurations (config-only — never secrets,
   never customer data). It is NOT a general version-control
   system, and restoring a version creates a NEW snapshot
   rather than destroying history.
   =========================================================== */

const themeOverridesSchema = new mongoose.Schema(
  {
    // Partial map of the canonical THEME_COLOR_KEYS → hex. Only overridden
    // tokens are stored; everything else inherits the compiled defaults +
    // the global ThemeSettings singleton, so adding a token to the registry
    // never breaks existing profiles. `strict` is inherited (true), so a
    // token key outside the registry is silently dropped by Mongoose —
    // the controller's sanitizer already filters them beforehand.
    colors: {
      type: Map,
      of: String,
      default: {},
    },
    typography: {
      type: String,
      enum: TYPOGRAPHY_PRESETS,
      default: "modern-sans",
    },
  },
  { _id: false },
);

const ctaSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    href: { type: String, default: "" },
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    // Client-stable id so the Studio editor can key rows without _id churn.
    id: { type: String, required: true },
    type: { type: String, enum: SECTION_TYPES, required: true },
    visible: { type: Boolean, default: true },
    variant: { type: String, default: "default" },
    heading: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    image: { type: String, default: "" },
    imageMobile: { type: String, default: "" },
    ctaLabel: { type: String, default: "" },
    ctaHref: { type: String, default: "" },
    // References into the REAL shared catalog — resolved at read time,
    // never denormalized copies of product data.
    categoryIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    productIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
  },
  { _id: false },
);

export const DEFAULT_SHOWCASE_CONFIG = Object.freeze({
  brandName: "",
  tagline: "",
  logoUrl: "",
  logoPublicId: "",
  faviconUrl: "",
  faviconPublicId: "",
  seoTitle: "",
  seoDescription: "",
  // Demo storefronts default to NOINDEX — the operator opts in per profile.
  seoIndexable: false,
  industry: "general",
  theme: { colors: {}, typography: "modern-sans" },
  hero: {
    image: "",
    imageMobile: "",
    heading: "",
    subheading: "",
    primaryCta: { label: "Shop Now", href: "/productsPage" },
    secondaryCta: { label: "", href: "" },
  },
  sections: [],
  categoryOrder: [],
  contact: {
    address: "",
    phone: "",
    email: "",
    whatsapp: "",
    social: {},
  },
  footer: { description: "", poweredBy: true },
  previewWatermark: false,
  watermarkText: "Prepared by Jazari Tech Official",
});

const showcaseConfigSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, trim: true, maxlength: 80 },
    tagline: { type: String, default: "", trim: true, maxlength: 160 },
  logoUrl: { type: String, default: "" },
  logoPublicId: { type: String, default: "" },
  faviconUrl: { type: String, default: "" },
  // Cloudinary public_id of the CURRENT favicon — tracked so a replacement
  // can clean up the previous asset (with a reference check first).
  faviconPublicId: { type: String, default: "" },
    seoTitle: { type: String, default: "", maxlength: 70 },
    seoDescription: { type: String, default: "", maxlength: 170 },
    // Per-profile indexing control (public SEO): false = noindex,nofollow
    // for the generated storefront page. Default false (demo storefronts
    // stay out of search until an operator explicitly opts in).
    seoIndexable: { type: Boolean, default: false },
    industry: {
      type: String,
      enum: INDUSTRY_PRESET_IDS,
      default: "general",
    },
    theme: { type: themeOverridesSchema, default: () => ({}) },
    hero: {
      type: new mongoose.Schema(
        {
          image: { type: String, default: "" },
          imageMobile: { type: String, default: "" },
          heading: { type: String, default: "", maxlength: 120 },
          subheading: { type: String, default: "", maxlength: 300 },
          primaryCta: { type: ctaSchema, default: () => ({ label: "Shop Now", href: "/productsPage" }) },
          secondaryCta: { type: ctaSchema, default: () => ({}) },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    sections: { type: [sectionSchema], default: [] },
    categoryOrder: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    contact: {
      type: new mongoose.Schema(
        {
          address: { type: String, default: "", maxlength: 240 },
          phone: { type: String, default: "", maxlength: 40 },
          email: { type: String, default: "", maxlength: 120 },
          whatsapp: { type: String, default: "", maxlength: 40 },
          social: { type: Map, of: String, default: {} },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    footer: {
      type: new mongoose.Schema(
        {
          description: { type: String, default: "", maxlength: 400 },
          poweredBy: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    previewWatermark: { type: Boolean, default: false },
    watermarkText: {
      type: String,
      default: "Prepared by Jazari Tech Official",
      maxlength: 80,
    },
  },
  { _id: false },
);

const versionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    note: { type: String, default: "", maxlength: 200 },
    // Full sanitized config snapshot at publish time (config only — no
    // secrets, no customer data).
    snapshot: { type: showcaseConfigSchema, required: true },
    publishedAt: { type: Date, default: Date.now },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false },
);

/** Hard cap on retained snapshots (oldest are dropped on overflow). */
export const MAX_SHOWCASE_VERSIONS = 25;

const brandProfileSchema = new mongoose.Schema(
  {
    name: {
      // Operator-facing profile name ("Anzara Studio — Fashion Demo").
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    slug: {
      // URL identity: /store/<slug>. Unique among non-archived profiles.
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    clientName: { type: String, default: "", trim: true, maxlength: 120 },
    industry: {
      type: String,
      enum: INDUSTRY_PRESET_IDS,
      default: "general",
      index: true,
    },
    status: {
      type: String,
      enum: SHOWCASE_STATUSES,
      default: "draft",
      index: true,
    },
    // Draft configuration the operator edits in the Showcase Studio.
    config: {
      type: showcaseConfigSchema,
      default: () => ({ brandName: "" }),
    },
    // Independent copy served to the public storefront when published.
    publishedConfig: {
      type: showcaseConfigSchema,
      default: null,
    },
    publishedAt: { type: Date, default: null },
    versions: {
      type: [versionSchema],
      default: [],
    },
    nextVersion: { type: Number, default: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

brandProfileSchema.index({ status: 1, updatedAt: -1 });
brandProfileSchema.index({ industry: 1, status: 1 });

// F-09: "preview" was removed from the status enum because no workflow ever
// used it. A legacy document that still carries it must save cleanly — coerce
// to "draft" BEFORE validation so the document heals on its next write.
brandProfileSchema.pre("validate", function (next) {
  if (this.status === "preview") this.status = "draft";
  next();
});

export const BrandProfile =
  mongoose.models.BrandProfile ||
  mongoose.model("BrandProfile", brandProfileSchema);
