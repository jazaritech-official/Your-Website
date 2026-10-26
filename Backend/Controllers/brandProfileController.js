import mongoose from "mongoose";
import { BrandProfile, MAX_SHOWCASE_VERSIONS } from "../Models/BrandProfile.js";
import { Product } from "../Models/Product.js";
import { Category } from "../Models/Category.js";
import { createError, createSuccess, signShowcaseRevalidateTicket } from "../utils/commonFunctions.js";
import { safeGet, safeSet, safeDel } from "../utils/redisCache.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import {
  THEME_TOKEN_REGISTRY,
  DEFAULT_THEME_COLORS,
} from "../utils/themeDefaults.js";
import {
  INDUSTRY_PRESET_IDS,
  SHOWCASE_STATUSES,
  SECTION_TYPES,
  TYPOGRAPHY_PRESETS,
  MAX_SECTIONS,
  sanitizeShowcaseConfig,
  isValidSlug,
  slugify,
} from "../utils/showcaseConfig.js";
import { generateWithFallback } from "../utils/geminiConfig.js";
// READ-ONLY reuse of the main catalogue's stock logic — variant-only-stock
// products must not show as "Out of stock" in showcases (never modified).
import { isProductInStock } from "../utils/inventory.js";

/* ===========================================================
   BRAND SHOWCASE PROFILE CONTROLLER
   -----------------------------------------------------------
   ARCHITECTURE (catalog scope decision)
   Showcases share the existing IRHAS'INN catalog. A profile
   only FEATURE-picks real products/categories by id for
   presentation; Product/Category/Order models are untouched,
   so all existing commerce, payment, referral and rider
   flows keep their authoritative data sources. Orders created
   from a branded storefront behave exactly like today.

   SECURITY BOUNDARIES
   • The PUBLIC endpoint serves ONLY publishedConfig of a
     profile whose status === "published". Drafts and previews
     require an authenticated admin.
   • Every write is behind verifyAdmin (routes file).
   • Every config write goes through sanitizeShowcaseConfig().
   • Public responses are small projections — never the raw
     administrative document.

   CACHE
   Redis cache-aside mirroring the theme controller:
   `app:showcase:pub:<slug>` + `app:showcase:publist`, both
   invalidated per-slug on write (never a global flush).
   =========================================================== */

const PUB_TTL = 300;
const pubKey = (slug) => `app:showcase:pub:${slug}`;
const PUB_LIST_KEY = "app:showcase:publist";

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/* ── catalog resolution (real data only — never synthesized) ── */

const resolveProducts = async (ids) => {
  const list = Array.isArray(ids) ? ids.slice(0, 24) : [];
  if (list.length === 0) return [];
  const docs = await Product.find({ _id: { $in: list } })
    .select("name slug price images stock variantStock")
    .lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return list
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      price: p.price ?? 0,
      image: p.images?.[0]?.url || "",
      // Same helper the main catalogue uses: variant-managed products count
      // their variant stocks, so a size-wise product with available variants
      // is NOT shown as "Out of stock" in the showcase.
      inStock: isProductInStock(p),
    }));
};

const resolveCategories = async (ids) => {
  const list = Array.isArray(ids) ? ids.slice(0, 24) : [];
  if (list.length === 0) return [];
  const docs = await Category.find({ _id: { $in: list } })
    .select("name slug image")
    .lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return list
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((c) => ({
      id: String(c._id),
      name: c.name,
      slug: c.slug || "",
      image: c.image || "",
    }));
};

/** Merge stored colour overrides onto the compiled defaults → cssVars. */
const buildTheme = (config) => {
  const overrides =
    config?.theme?.colors instanceof Map
      ? Object.fromEntries(config.theme.colors)
      : (config?.theme?.colors || {});
  const colors = { ...DEFAULT_THEME_COLORS };
  for (const [key, value] of Object.entries(overrides)) {
    if (THEME_TOKEN_REGISTRY.some((t) => t.apiKey === key)) colors[key] = value;
  }
  const cssVars = {};
  for (const token of THEME_TOKEN_REGISTRY) {
    cssVars[token.cssVar] = colors[token.apiKey];
  }
  return {
    colors,
    cssVars,
    typography: TYPOGRAPHY_PRESETS.includes(config?.theme?.typography)
      ? config.theme.typography
      : "modern-sans",
  };
};

/**
 * Build the SMALL public/preview payload from a config, resolving section
 * product/category references against the real shared catalog.
 */
const resolvePublicConfig = async (config, { slug, status } = {}) => {
  const sections = await Promise.all(
    (config.sections || []).map(async (section) => {
      const base = {
        id: section.id,
        type: section.type,
        visible: section.visible !== false,
        variant: section.variant || "default",
        heading: section.heading || "",
        subtitle: section.subtitle || "",
        image: section.image || "",
        imageMobile: section.imageMobile || "",
        ctaLabel: section.ctaLabel || "",
        ctaHref: section.ctaHref || "",
      };
      const [products, categories] = await Promise.all([
        section.productIds?.length ? resolveProducts(section.productIds) : [],
        section.categoryIds?.length ? resolveCategories(section.categoryIds) : [],
      ]);
      return { ...base, products, categories };
    }),
  );

  const categories = await resolveCategories(config.categoryOrder || []);
  const social =
    config?.contact?.social instanceof Map
      ? Object.fromEntries(config.contact.social)
      : { ...(config?.contact?.social || {}) };

  return {
    slug: slug || null,
    status: status || null,
    brandName: config.brandName || "",
    tagline: config.tagline || "",
    logoUrl: config.logoUrl || "",
    faviconUrl: config.faviconUrl || "",
    seoTitle: config.seoTitle || "",
    seoDescription: config.seoDescription || "",
    // Indexing control travels with the PUBLIC projection so the storefront's
    // generateMetadata can honour it — default false (noindex) for demos.
    seoIndexable: config.seoIndexable === true,
    industry: INDUSTRY_PRESET_IDS.includes(config.industry) ? config.industry : "general",
    theme: buildTheme(config),
    hero: {
      image: config.hero?.image || "",
      imageMobile: config.hero?.imageMobile || "",
      heading: config.hero?.heading || "",
      subheading: config.hero?.subheading || "",
      primaryCta: {
        label: config.hero?.primaryCta?.label || "Shop Now",
        href: config.hero?.primaryCta?.href || "/productsPage",
      },
      secondaryCta: {
        label: config.hero?.secondaryCta?.label || "",
        href: config.hero?.secondaryCta?.href || "",
      },
    },
    sections,
    categories,
    contact: {
      address: config.contact?.address || "",
      phone: config.contact?.phone || "",
      email: config.contact?.email || "",
      whatsapp: config.contact?.whatsapp || "",
      social,
    },
    footer: {
      description: config.footer?.description || "",
      poweredBy: config.footer?.poweredBy !== false,
    },
    previewWatermark: config.previewWatermark === true,
    watermarkText: config.watermarkText || "Prepared by Jazari Tech Official",
  };
};

/* ── admin document shaping ─────────────────────────────────── */

const toAdminShape = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  clientName: doc.clientName || "",
  industry: doc.industry,
  // F-09: the legacy "preview" status is read as "draft" so old documents
  // behave exactly like a normal draft everywhere in the Studio.
  status: doc.status === "preview" ? "draft" : doc.status,
  config: plainConfig(doc.config),
  hasPublishedConfig: !!doc.publishedConfig?.brandName,
  publishedAt: doc.publishedAt || null,
  versions: (doc.versions || [])
    .slice()
    .sort((a, b) => b.version - a.version)
    .map((v) => ({
      version: v.version,
      note: v.note || "",
      publishedAt: v.publishedAt,
      publishedBy: v.publishedBy ? String(v.publishedBy) : null,
    })),
  nextVersion: doc.nextVersion || 1,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/** Convert a stored config (Map subdocs → plain objects) for JSON responses. */
const plainConfig = (config) => {
  if (!config) return null;
  const c = config.toObject ? config.toObject() : { ...config };
  const colors =
    c.theme?.colors instanceof Map
      ? Object.fromEntries(c.theme.colors)
      : { ...(c.theme?.colors || {}) };
  const social =
    c.contact?.social instanceof Map
      ? Object.fromEntries(c.contact.social)
      : { ...(c.contact?.social || {}) };
  return {
    ...c,
    theme: { ...(c.theme || {}), colors },
    contact: { ...(c.contact || {}), social },
    sections: (c.sections || []).map((s) => ({
      ...s,
      categoryIds: (s.categoryIds || []).map(String),
      productIds: (s.productIds || []).map(String),
    })),
    categoryOrder: (c.categoryOrder || []).map(String),
  };
};

/* ── cache invalidation (targeted, never a global flush) ────── */

const invalidateShowcase = async (slug) => {
  try {
    await safeDel(pubKey(slug));
    await safeDel(PUB_LIST_KEY);
  } catch {
    // safeDel already swallows — TTL is the backstop.
  }
};

/* ===========================================================
   FRONTEND ON-DEMAND PURGE (F-07)
   -----------------------------------------------------------
   The storefront's /store pages are ISR (revalidate: 300 + fetch tags
   `showcase-<slug>` / `showcase-list`). Without an on-demand purge, a
   publish would take up to 5 minutes to appear. The BACKEND therefore
   calls the frontend's /api/showcase/revalidate route server-to-server
   after any mutation that changes PUBLIC output, sending a short-lived
   showcase-scoped ticket (signed with a derived key — the frontend holds
   no signing key and exchanges the ticket back at
   POST /brand-profiles/revalidate/authorize).
   =========================================================== */

/** Exchange endpoint for the frontend revalidate route (ticket-authed, public path). */
export const authorizeShowcaseRevalidate = (req, res) => {
  res.status(200).json(
    createSuccess(200, "Revalidation authorized", {
      scope: req.revalidateTicket?.scope || null,
    }),
  );
};

/**
 * Ask the FRONTEND to purge its ISR cache for this showcase.
 * NEVER throws — a failed purge must not fail the mutation (the 5-minute
 * ISR TTL and the backend's Redis TTL remain the backstop). Returns null
 * on success or a human-readable reason on failure. No secrets are logged.
 */
const purgeFrontendShowcaseCache = async (slug, user) => {
  const frontendUrl = String(process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (!frontendUrl) return "FRONTEND_URL is not configured";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const ticket = signShowcaseRevalidateTicket(user);
    const res = await fetch(`${frontendUrl}/api/showcase/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ticket}`,
      },
      body: JSON.stringify({ slug }),
      signal: controller.signal,
    });
    if (!res.ok) return `frontend revalidate route returned HTTP ${res.status}`;
    return null;
  } catch (err) {
    return err?.name === "AbortError"
      ? "frontend revalidate route timed out"
      : err?.message || "network error";
  } finally {
    clearTimeout(timer);
  }
};

/** Non-fatal warnings entry for a failed purge (also logged server-side). */
const purgeWarning = (slug, reason) => {
  const message = `On-demand cache purge failed (${reason}) — /store/${slug} updates automatically within 5 minutes`;
  console.warn(`[Showcase] ${message}`);
  return { path: "cache", code: "PURGE_FAILED", message };
};

/* ===========================================================
   PUBLIC ENDPOINTS (no auth — published configuration only)
   =========================================================== */

/**
 * GET /brand-profiles/public/:slug
 * Serves the published configuration of one showcase. Cached in Redis.
 * A non-published profile returns 404 — drafts/previews are never public.
 */
export const getPublicShowcase = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!isValidSlug(slug)) {
      return next(createError(404, "Showcase not found"));
    }

    try {
      const cached = await safeGet(pubKey(slug));
      if (cached) {
        res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).json(createSuccess(200, "Showcase fetched", cached));
      }
    } catch {
      // cache miss path
    }

    const doc = await BrandProfile.findOne({ slug, status: "published" })
      .select("slug name clientName publishedConfig publishedAt updatedAt")
      .lean();
    if (!doc || !doc.publishedConfig?.brandName) {
      return next(createError(404, "Showcase not found"));
    }

    const payload = await resolvePublicConfig(doc.publishedConfig, {
      slug: doc.slug,
      status: "published",
    });
    payload.publishedAt = doc.publishedAt;

    await safeSet(pubKey(slug), payload, PUB_TTL);
    res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(createSuccess(200, "Showcase fetched", payload));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /brand-profiles/public
 * Tiny list of published showcases (slug + brand name + industry) —
 * used by the storefront's showcase directory.
 */
export const listPublicShowcases = async (req, res, next) => {
  try {
    try {
      const cached = await safeGet(PUB_LIST_KEY);
      if (cached) {
        res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).json(createSuccess(200, "Showcases fetched", cached));
      }
    } catch {
      // cache miss path
    }

    const docs = await BrandProfile.find({ status: "published" })
      .select("slug name clientName industry publishedConfig.brandName publishedConfig.tagline publishedConfig.logoUrl")
      .sort({ publishedAt: -1 })
      .limit(50)
      .lean();

    const list = docs
      .filter((d) => d.publishedConfig?.brandName)
      .map((d) => ({
        slug: d.slug,
        name: d.name,
        clientName: d.clientName || "",
        brandName: d.publishedConfig.brandName,
        tagline: d.publishedConfig.tagline || "",
        logoUrl: d.publishedConfig.logoUrl || "",
        industry: d.industry,
      }));

    await safeSet(PUB_LIST_KEY, list, PUB_TTL);
    res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(createSuccess(200, "Showcases fetched", list));
  } catch (error) {
    next(error);
  }
};

/* ===========================================================
   ADMIN — LIST / READ
   =========================================================== */

export const listShowcases = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const filter = {};

    if (req.query.status && SHOWCASE_STATUSES.includes(req.query.status)) {
      // F-09: legacy "preview" documents are drafts — include them when the
      // operator filters by draft so they never vanish from the list.
      filter.status =
        req.query.status === "draft" ? { $in: ["draft", "preview"] } : req.query.status;
    }
    if (req.query.industry && INDUSTRY_PRESET_IDS.includes(req.query.industry)) {
      filter.industry = req.query.industry;
    }
    if (req.query.q && String(req.query.q).trim()) {
      const q = String(req.query.q).trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { clientName: { $regex: q, $options: "i" } },
      ];
    }

    const [docs, total] = await Promise.all([
      BrandProfile.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BrandProfile.countDocuments(filter),
    ]);

    return res.status(200).json(
      createSuccess(200, "Showcases fetched", {
        profiles: docs.map(toAdminShape),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      }),
    );
  } catch (error) {
    next(error);
  }
};

export const getShowcase = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const doc = await BrandProfile.findById(req.params.id).lean();
    if (!doc) return next(createError(404, "Showcase not found"));
    return res.status(200).json(createSuccess(200, "Showcase fetched", toAdminShape(doc)));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /brand-profiles/admin/:id/preview-config
 * Resolves the DRAFT config (including real catalog references) for the
 * authenticated Studio preview. Admin-only — drafts are never public.
 */
export const getPreviewConfig = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const doc = await BrandProfile.findById(req.params.id).lean();
    if (!doc) return next(createError(404, "Showcase not found"));
    const payload = await resolvePublicConfig(doc.config, {
      slug: doc.slug,
      status: doc.status,
    });
    return res.status(200).json(createSuccess(200, "Preview config fetched", payload));
  } catch (error) {
    next(error);
  }
};

/* ===========================================================
   ADMIN — CREATE / UPDATE
   =========================================================== */

const assertSlugFree = async (slug, excludeId) => {
  const filter = { slug };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await BrandProfile.findOne(filter).select("_id").lean();
  return !existing;
};

export const createShowcase = async (req, res, next) => {
  try {
    const {
      name,
      clientName,
      industry,
      config,
      slug: rawSlug,
      sectionOrder: rawSectionOrder,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return next(createError(400, "Profile name is required"));
    }

    const slug = isValidSlug(rawSlug) ? rawSlug : slugify(name);
    if (!isValidSlug(slug)) {
      return next(
        createError(400, "Could not derive a valid slug — provide letters, numbers and dashes"),
      );
    }
    if (!(await assertSlugFree(slug))) {
      return next(createError(409, "A showcase with this slug already exists"));
    }

    // F-10: an unknown industry is a 400 on BOTH create and update — never
    // a silent fallback to "general". (The sanitizer still coerces as
    // defence-in-depth for non-API callers, but the API boundary rejects.)
    if (
      (industry !== undefined && industry !== "" && !INDUSTRY_PRESET_IDS.includes(industry)) ||
      (config?.industry && !INDUSTRY_PRESET_IDS.includes(config.industry))
    ) {
      return next(createError(400, "Unknown industry preset"));
    }

    // Optional (F-presets): the operator asked to START from a preset's
    // suggested homepage section order. Applies only when the incoming
    // config has no sections yet; the placeholders are EMPTY-but-valid and
    // are flagged by the sanitizer's INCOMPLETE_SECTION warnings until
    // filled with real catalog picks. Nothing is ever invented — no fake
    // products or categories.
    let sections = Array.isArray(config?.sections) ? config.sections : undefined;
    if ((!sections || sections.length === 0) && Array.isArray(rawSectionOrder)) {
      const placeholders = rawSectionOrder
        .filter((t) => typeof t === "string" && SECTION_TYPES.includes(t))
        .slice(0, MAX_SECTIONS)
        .map((type) => ({ type, heading: "" }));
      if (placeholders.length) sections = placeholders;
    }

    const { ok, errors, warnings, value } = sanitizeShowcaseConfig({
      ...(config || {}),
      ...(sections ? { sections } : {}),
      brandName: config?.brandName || String(name).trim(),
    });
    if (!ok && !value.brandName) {
      return next(createError(400, errors.join("; ")));
    }

    const doc = await BrandProfile.create({
      name: String(name).trim().slice(0, 100),
      slug,
      clientName: String(clientName || "").trim().slice(0, 120),
      industry: INDUSTRY_PRESET_IDS.includes(industry) ? industry : value.industry,
      status: "draft",
      config: value,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });

    // Warnings (F-03): non-fatal sanitizer findings (incomplete sections,
    // rejected values) travel back so the editor can surface them instead of
    // silently dropping the operator's work.
    return res.status(201).json(
      createSuccess(201, "Showcase created", {
        ...toAdminShape(doc.toObject()),
        warnings,
      }),
    );
  } catch (error) {
    if (error?.code === 11000) {
      return next(createError(409, "A showcase with this slug already exists"));
    }
    next(error);
  }
};

export const updateShowcase = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const doc = await BrandProfile.findById(req.params.id);
    if (!doc) return next(createError(404, "Showcase not found"));

    const { name, clientName, industry, config, slug: rawSlug } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      if (!String(name).trim()) return next(createError(400, "Profile name cannot be empty"));
      updates.name = String(name).trim().slice(0, 100);
    }
    if (clientName !== undefined) {
      updates.clientName = String(clientName || "").trim().slice(0, 120);
    }
    // F-10: identical semantics to createShowcase — an empty industry means
    // "not provided"; a non-empty unknown id is a 400 (never a silent
    // fallback to "general").
    if (industry !== undefined && industry !== "") {
      if (!INDUSTRY_PRESET_IDS.includes(industry)) {
        return next(createError(400, "Unknown industry preset"));
      }
      updates.industry = industry;
      updates["config.industry"] = industry;
    }
    if (rawSlug !== undefined) {
      const slug = String(rawSlug).toLowerCase().trim();
      if (!isValidSlug(slug)) return next(createError(400, "Invalid slug"));
      if (!(await assertSlugFree(slug, doc._id))) {
        return next(createError(409, "A showcase with this slug already exists"));
      }
      updates.slug = slug;
    }

    // Full config replacement through the sanitizer (draft only — the
    // published copy is untouched until an explicit publish).
    let warnings = [];
    if (config !== undefined) {
      // F-10: unknown industry inside the config is rejected symmetrically
      // with the top-level field and with createShowcase.
      if (config?.industry && !INDUSTRY_PRESET_IDS.includes(config.industry)) {
        return next(createError(400, "Unknown industry preset"));
      }
      const { errors, value, warnings: sanitizeWarnings } = sanitizeShowcaseConfig({
        ...(config || {}),
        brandName: config?.brandName || doc.config?.brandName,
      });
      if (!value.brandName) {
        return next(createError(400, errors.join("; ") || "brandName is required"));
      }
      updates.config = value;
      updates.industry = value.industry;
      warnings = sanitizeWarnings;
    }

    updates.updatedBy = req.user?.id || null;

    // Optimistic concurrency (PUT): the editor sends the updatedAt it
    // loaded; folding it into the write query means a STALE tab gets a 409
    // instead of silently overwriting another tab's changes. Enforced only
    // when the client sends the field (backwards compatible).
    const expectedUpdatedAt = req.body?.expectedUpdatedAt;
    let expectedDate = null;
    if (expectedUpdatedAt) {
      const parsed = new Date(expectedUpdatedAt);
      if (!Number.isNaN(parsed.getTime())) expectedDate = parsed;
    }

    const saved = await BrandProfile.findOneAndUpdate(
      {
        _id: req.params.id,
        ...(expectedDate ? { updatedAt: expectedDate } : {}),
      },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!saved) {
      return next(
        createError(
          409,
          "This showcase was changed elsewhere — reload the editor and try again",
          "CONFLICT",
        ),
      );
    }

    await invalidateShowcase(doc.slug);
    if (updates.slug && updates.slug !== doc.slug) {
      await invalidateShowcase(updates.slug);
    }

    // Warnings (F-03): returned alongside the saved draft so the editor can
    // toast + inline-surface incomplete sections and rejected values.
    return res.status(200).json(
      createSuccess(200, "Showcase saved", { ...toAdminShape(saved), warnings }),
    );
  } catch (error) {
    if (error?.code === 11000) {
      return next(createError(409, "A showcase with this slug already exists"));
    }
    next(error);
  }
};

/* ===========================================================
   ADMIN — LOGO / ASSET UPLOAD (existing Cloudinary pipeline)
   =========================================================== */

/**
 * Is a Cloudinary asset public_id still referenced by ANY showcase profile?
 *
 * Checked across the draft config, the published config and every version
 * snapshot, on every profile (not just the current one): "Duplicate"
 * copies `logoPublicId`/`faviconPublicId` verbatim, so a sibling profile may
 * legitimately share the same asset. The showcase collection is small
 * (operator-managed), so this single indexed-by-nothing existence check on
 * write-path asset replacement is acceptable and errs on the side of KEEPING
 * an asset whenever anything still points at it.
 */
const assetIsStillReferenced = async (publicId) => {
  if (!publicId) return false;
  const or = [];
  for (const field of ["logoPublicId", "faviconPublicId"]) {
    or.push({ [`config.${field}`]: publicId });
    or.push({ [`publishedConfig.${field}`]: publicId });
    or.push({ [`versions.snapshot.${field}`]: publicId });
  }
  return !!(await BrandProfile.exists({ $or: or }));
};

export const uploadShowcaseAsset = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    if (!req.file) return next(createError(400, "Image file is required"));

    const rawKind = String(req.query.kind || "logo");
    const kind = ["favicon", "image"].includes(rawKind) ? rawKind : "logo";
    const doc = await BrandProfile.findById(req.params.id);
    if (!doc) return next(createError(404, "Showcase not found"));

    let result;
    try {
      result = await uploadToCloudinary(req.file.buffer, `irhasinn/Showcase/${doc.slug}/${kind}`);
    } catch {
      return next(createError(500, "Asset upload failed"));
    }
    if (!result?.secure_url || !result?.public_id) {
      return next(createError(500, "Asset upload returned incomplete data"));
    }

    /*
      kind="image" is an UPLOAD-ONLY helper for hero/section imagery: the
      returned URL is pasted into the relevant config field by the Studio
      editor. The document itself is NOT mutated, so no cleanup is needed
      here — the operator replaces images through the normal config save.
    */
    if (kind === "image") {
      return res.status(200).json(
        createSuccess(200, "Image uploaded", {
          kind,
          url: result.secure_url,
          publicId: result.public_id,
        }),
      );
    }

    /*
      Logo / favicon uploads mutate the DRAFT configuration directly (the
      published copy is untouched — draft/publish separation is preserved).
      The replaced asset's Cloudinary public_id is tracked so it can be
      cleaned up, BUT only after a reference check: the same asset may still
      be referenced by this profile's publishedConfig or a version snapshot,
      or by a DUPLICATED profile (duplicate copies logoPublicId verbatim).
      Deleting a referenced asset would break a live storefront, so we never
      delete anything still referenced anywhere.
    */
    const stalePublicId =
      kind === "favicon"
        ? doc.config.faviconPublicId || ""
        : doc.config.logoPublicId || "";

    if (kind === "favicon") {
      doc.config.faviconUrl = result.secure_url;
      doc.config.faviconPublicId = result.public_id;
    } else {
      doc.config.logoUrl = result.secure_url;
      doc.config.logoPublicId = result.public_id;
    }
    doc.updatedBy = req.user?.id || null;
    await doc.save();

    await invalidateShowcase(doc.slug);

    // Conditional cleanup — runs AFTER the save so the current document no
    // longer references the stale id. Failure here is logged (no secrets)
    // and never fails the request: an orphan in Cloudinary is strictly
    // better than a failed upload.
    if (stalePublicId && stalePublicId !== result.public_id) {
      try {
        const stillReferenced = await assetIsStillReferenced(stalePublicId);
        if (stillReferenced) {
          console.log(
            "[Showcase] Keeping replaced asset — still referenced by a published config, snapshot or duplicate profile",
          );
        } else {
          await deleteFromCloudinary(stalePublicId);
        }
      } catch (cleanupErr) {
        console.error("[Showcase] Asset cleanup failed:", cleanupErr.message || cleanupErr);
      }
    }

    return res.status(200).json(
      createSuccess(200, `${kind === "favicon" ? "Favicon" : "Logo"} uploaded`, {
        kind,
        url: result.secure_url,
        publicId: result.public_id,
        showcase: toAdminShape(doc.toObject()),
      }),
    );
  } catch (error) {
    next(error);
  }
};

/* ===========================================================
   ADMIN — LIFECYCLE: publish / archive / restore / duplicate
   =========================================================== */

export const publishShowcase = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const doc = await BrandProfile.findById(req.params.id);
    if (!doc) return next(createError(404, "Showcase not found"));
    if (doc.status === "archived") {
      return next(createError(400, "Restore the showcase before publishing"));
    }

    // Re-sanitize the draft at publish time — the published copy must always
    // be a fully validated configuration even if it was written by an older
    // schema version.
    const { value, warnings: publishWarnings } = sanitizeShowcaseConfig(plainConfig(doc.config));
    // Publish-blocking problems (F-03): a missing brand name or any section
    // that was kept but is incomplete. The editor pre-checks the same rules
    // client-side, but the server is the authority.
    const blocking = publishWarnings.filter(
      (w) => w.code === "INCOMPLETE_SECTION" || w.code === "REQUIRED",
    );
    if (!value.brandName || blocking.length) {
      const problems = blocking.length
        ? blocking.map((w) => w.message)
        : ["The draft configuration is incomplete — set a brand name first"];
      return next(createError(400, `Cannot publish — ${problems.join("; ")}`, "PUBLISH_BLOCKED"));
    }

    // Atomic version reservation (concurrency): $inc reserves the version
    // number in a single atomic op, so two concurrent publishes can NEVER
    // produce the same version number. The archived guard rides along on the
    // same query. A failure in the follow-up save leaves a harmless numeric
    // gap — versions stay unique and monotonic.
    const reservation = await BrandProfile.findOneAndUpdate(
      { _id: doc._id, status: { $ne: "archived" } },
      { $inc: { nextVersion: 1 } },
      { new: false },
    );
    if (!reservation) {
      return next(createError(400, "Restore the showcase before publishing"));
    }
    const version = reservation.nextVersion || 1;

    // The published copy swaps in one write. A failure here leaves the
    // previously published configuration intact.
    doc.publishedConfig = value;
    doc.status = "published";
    doc.publishedAt = new Date();
    doc.versions = [
      ...(doc.versions || []),
      {
        version,
        note: String(req.body?.note || "").slice(0, 200),
        snapshot: value,
        publishedAt: new Date(),
        publishedBy: req.user?.id || null,
      },
    ].slice(-MAX_SHOWCASE_VERSIONS); // cap: drop oldest snapshots
    // nextVersion was bumped atomically above — never touched here (save()
    // only writes modified paths, so the stale in-memory value cannot
    // clobber the reservation).
    doc.updatedBy = req.user?.id || null;
    await doc.save();

    await invalidateShowcase(doc.slug);

    // F-07: purge the frontend ISR tags for the public page + directory.
    // Non-fatal: on failure the publish still succeeds (TTL backstop) and
    // the caller gets a warnings entry explaining the delay.
    const purgeReason = await purgeFrontendShowcaseCache(doc.slug, req.user);
    const warnings = purgeReason ? [purgeWarning(doc.slug, purgeReason)] : [];

    return res.status(200).json(
      createSuccess(200, "Showcase published", {
        ...toAdminShape(doc.toObject()),
        revalidateToken: null,
        warnings,
      }),
    );
  } catch (error) {
    next(error);
  }
};

export const setArchived = async (archived) => async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const doc = await BrandProfile.findById(req.params.id);
    if (!doc) return next(createError(404, "Showcase not found"));

    doc.status = archived ? "archived" : doc.publishedConfig?.brandName ? "published" : "draft";
    doc.updatedBy = req.user?.id || null;
    await doc.save();

    // An archived profile must disappear from the public storefront.
    await invalidateShowcase(doc.slug);

    // F-07: archive/unarchive changes the PUBLIC 200/404 outcome, so the
    // frontend ISR tags must be purged too (non-fatal, as above).
    const purgeReason = await purgeFrontendShowcaseCache(doc.slug, req.user);
    const warnings = purgeReason ? [purgeWarning(doc.slug, purgeReason)] : [];

    return res
      .status(200)
      .json(
        createSuccess(200, archived ? "Showcase archived" : "Showcase restored", {
          ...toAdminShape(doc.toObject()),
          warnings,
        }),
      );
  } catch (error) {
    next(error);
  }
};

export const archiveShowcase = setArchived(true);
export const unarchiveShowcase = setArchived(false);

export const duplicateShowcase = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const source = await BrandProfile.findById(req.params.id).lean();
    if (!source) return next(createError(404, "Showcase not found"));

    const baseSlug = slugify(`${source.slug}-copy`);
    let slug = baseSlug;
    let n = 2;
    while (!(await assertSlugFree(slug))) {
      slug = `${baseSlug}-${n++}`;
      if (n > 50) return next(createError(409, "Could not derive a free slug for the copy"));
    }

    const copy = await BrandProfile.create({
      name: `${source.name} (Copy)`.slice(0, 100),
      slug,
      clientName: source.clientName || "",
      industry: source.industry,
      status: "draft", // copies always start as drafts — never auto-publish
      config: plainConfig(source.config),
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });

    return res.status(201).json(createSuccess(201, "Showcase duplicated", toAdminShape(copy.toObject())));
  } catch (error) {
    next(error);
  }
};

/* ===========================================================
   ADMIN — VERSION HISTORY / RESTORE
   =========================================================== */

/**
 * POST /brand-profiles/admin/:id/versions/:version/restore
 * Restoring never destroys history: the old snapshot is re-applied to the
 * DRAFT config and publishing it again records a NEW version.
 */
export const restoreVersion = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid showcase id"));
    }
    const version = parseInt(req.params.version);
    const doc = await BrandProfile.findById(req.params.id);
    if (!doc) return next(createError(404, "Showcase not found"));

    const snapshot = (doc.versions || []).find((v) => v.version === version);
    if (!snapshot) return next(createError(404, "Version not found"));

    doc.config = plainConfig(snapshot.snapshot);
    doc.updatedBy = req.user?.id || null;
    await doc.save();
    await invalidateShowcase(doc.slug);

    return res.status(200).json(
      createSuccess(200, `Version ${version} restored to the draft`, toAdminShape(doc.toObject())),
    );
  } catch (error) {
    next(error);
  }
};

/* ===========================================================
   ADMIN — AI-ASSISTED BRAND DIRECTION
   -----------------------------------------------------------
   Uses the EXISTING Gemini integration (generateWithFallback).
   Returns validated SUGGESTIONS ONLY — nothing is saved and
   nothing is published; the operator reviews and applies.
   When GEMINI_API_KEY is missing the route answers with code
   AI_NOT_CONFIGURED and every manual workflow keeps working.
   =========================================================== */

const AI_SUGGEST_SCHEMA_EXAMPLE = {
  palette: {
    brandNavy: "#2A2A2A",
    brandNavyDeep: "#1A1A1A",
    brandNavySoft: "#3F3F3F",
    brandGold: "#B08D57",
    brandGoldStrong: "#9C7A45",
    brandGoldHover: "#8A6835",
    surfaceCard: "#FFFFFF",
    surfacePage: "#FAF8F5",
    surfaceMuted: "#F3EFE9",
    line: "#E7E0D6",
    lineSoft: "#F1ECE4",
    ink: "#1F1A15",
    inkMuted: "#6E6459",
    inkSubtle: "#9A9086",
  },
  typography: "editorial",
  hero: {
    heading: "Timeless pieces for the modern wardrobe",
    subheading: "Curated seasonal collections, delivered across Pakistan.",
    primaryCtaLabel: "Shop Collection",
    secondaryCtaLabel: "New Arrivals",
  },
  sectionOrder: ["hero", "featuredCategories", "featuredProducts", "brandIntro", "trustRow"],
  seoTitle: "Anzara Studio | Premium Women's Fashion",
  seoDescription: "Discover curated women's fashion…",
  brandTone: "Elegant, warm, editorial",
  rationale: "Why this direction fits the brand",
};

const clampText = (v, max) => String(v || "").trim().slice(0, max);

export const aiSuggestBrandDirection = async (req, res, next) => {
  try {
    const {
      brandName,
      industry,
      description,
      audience,
      mood,
      preferredColors,
    } = req.body || {};

    if (!brandName || !String(brandName).trim()) {
      return next(createError(400, "brandName is required"));
    }
    if (industry && !INDUSTRY_PRESET_IDS.includes(industry)) {
      return next(createError(400, "Unknown industry preset"));
    }

    const prompt = `You are a senior e-commerce brand designer at Jazari Tech Official.
Design a brand direction for an online store. Respond with ONLY a JSON object (no markdown, no prose) matching EXACTLY this shape:

${JSON.stringify(AI_SUGGEST_SCHEMA_EXAMPLE, null, 2)}

Rules:
- palette: fill EVERY key shown with valid 6-digit hex colours tuned to the brand (keep semantic surface/ink/line harmonious and readable).
- typography: choose ONE of: "classic-serif", "modern-sans", "editorial", "minimal".
- sectionOrder: choose 4-6 items from: hero, featuredCategories, featuredProducts, categoryRow, promoBanner, brandIntro, trustRow, reviewSummary. Start with "hero".
- hero.heading <= 90 chars, hero.subheading <= 180 chars, CTA labels <= 28 chars.
- seoTitle <= 65 chars, seoDescription <= 155 chars.
- Never invent discounts, certifications, medical claims or free-shipping promises.

Brand brief:
- Brand name: ${clampText(brandName, 80)}
- Industry preset: ${industry || "general"}
- Business description: ${clampText(description, 400) || "(not provided)"}
- Target audience: ${clampText(audience, 200) || "(not provided)"}
- Desired mood: ${clampText(mood, 120) || "(not provided)"}
- Preferred colours (optional): ${clampText(preferredColors, 120) || "(not provided)"}`;

    let result;
    try {
      result = await generateWithFallback({
        contents: prompt,
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      });
    } catch (err) {
      // Surface a clear, truthful "not configured" state to the Studio UI.
      if (err?.code === "AI_NOT_CONFIGURED") {
        return res.status(503).json({
          success: false,
          status: 503,
          message:
            "AI suggestions are unavailable — GEMINI_API_KEY is not configured. All manual brand-editing tools remain fully available.",
          code: "AI_NOT_CONFIGURED",
        });
      }
      throw err;
    }

    /* ── strict validation of the AI output ── */
    let parsed;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      return next(createError(502, "The AI response could not be parsed — please try again"));
    }

    const suggestion = {
      palette: {},
      typography: TYPOGRAPHY_PRESETS.includes(parsed.typography)
        ? parsed.typography
        : "modern-sans",
      hero: {
        heading: clampText(parsed.hero?.heading, 120),
        subheading: clampText(parsed.hero?.subheading, 300),
        primaryCtaLabel: clampText(parsed.hero?.primaryCtaLabel, 40),
        secondaryCtaLabel: clampText(parsed.hero?.secondaryCtaLabel, 40),
      },
      sectionOrder: Array.isArray(parsed.sectionOrder)
        ? parsed.sectionOrder
            .filter((s) => SECTION_TYPES.includes(s))
            .slice(0, 8)
        : [],
      seoTitle: clampText(parsed.seoTitle, 70),
      seoDescription: clampText(parsed.seoDescription, 170),
      brandTone: clampText(parsed.brandTone, 120),
      rationale: clampText(parsed.rationale, 500),
    };

    // Only registry-known, valid-hex colours survive.
    if (parsed.palette && typeof parsed.palette === "object") {
      for (const [key, value] of Object.entries(parsed.palette)) {
        if (!THEME_TOKEN_REGISTRY.some((t) => t.apiKey === key)) continue;
        if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
          suggestion.palette[key] = value.trim();
        }
      }
    }

    return res.status(200).json(
      createSuccess(200, "Brand direction generated", {
        suggestion,
        model: result.model,
        usedFallback: result.usedFallback,
        // The Studio UI must present this as an editable DRAFT.
        applied: false,
      }),
    );
  } catch (error) {
    next(error);
  }
};
