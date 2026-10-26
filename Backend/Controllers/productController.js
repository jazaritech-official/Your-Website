import { Product } from "../Models/Product.js";
import Users from "../Models/Users.js"; // ensures Mongoose registers the User schema for populate()
import { Category } from "../Models/Category.js";
import { Subcategory } from "../Models/Subcategory.js";
import { Conversation } from "../Models/Conversation.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { debugLog } from "../utils/debugLog.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { runAfterResponse } from "../utils/afterResponse.js";
import slugify from "slugify";import { safeGet,
  safeSet,
  invalidateProductListings,
  invalidateCategoriesCache,
  invalidateProductDetail,
  invalidateRelatedProductsCache,
} from "../utils/redisCache.js";
import {
  hasVariantInventory,
  sumVariantStocks,
  getEffectiveStock,
  isProductInStock,
  buildBroadInStockFilter,
  filterInStockProducts,
} from "../utils/inventory.js";
import { buildAdminProductFilter } from "../utils/productFilters.js";

// Cache TTL for a single product's detail payload (getProductById). Kept short
// so price/stock/rating changes never stay stale long; the endpoint was
// measured at ~690-700ms warm. Any Redis issue falls back to the DB read.
const DETAIL_CACHE_TTL = 60; // seconds

// ====================================================
// Feature 2: Default tags for every product
// ====================================================

const DEFAULT_TAGS = ["karachi", "pakistan", "onlineshopping", "viral", "irhasinn"];

/**
 * Merge default tags into provided tags array.
 * Performs case‑insensitive deduplication while preserving original order.
 */
function mergeDefaultTags(tagsArray) {
  if (!Array.isArray(tagsArray)) tagsArray = [];
  // Create a map for case‑insensitive lookup
  const seen = new Set(tagsArray.map(t => t.toLowerCase()));
  // Add any missing default tags
  DEFAULT_TAGS.forEach(tag => {
    if (!seen.has(tag.toLowerCase())) {
      tagsArray.push(tag);
      seen.add(tag.toLowerCase());
    }
  });
  return tagsArray;
}
// ==================== REDIS LISTING CACHE (additive) ====================
// Short TTL so stock/price/availability changes never stay stale long,
// but long enough to cut the duplicate DB load from the repeated
// homepage / category-page fetches. Any Redis issue falls back to the
// direct DB reads below (safeGet returns null on a miss/error).
const LIST_CACHE_TTL = 90; // seconds

// Stable cache key derived from the FULL query string — every parameter
// that can change the result (category, sort, page, search, price, brand,
// limit) is folded in, so different queries never collide on one key.
const listCacheKey = (prefix, query = {}) => {
  const normalized = {};
  for (const key of Object.keys(query).sort()) {
    const v = query[key];
    if (v !== undefined && v !== null && v !== "") normalized[key] = v;
  }
  return `${prefix}${JSON.stringify(normalized)}`;
};

// ==================== UTILITY FUNCTIONS ====================

// Escape regex special characters in user-supplied filter values.
const escapeRegExp = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseArray = (value) => {
  try {
    if (!value) return [];
    if (typeof value === "string") {
      if (value.includes(",")) {
        return value.split(",").map((item) => item.trim());
      }
    }
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return [];
  }
};

// Parse a JSON-string-or-object field safely (used for printLayout).
const parseJsonField = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};

// Parse the optional imagesMeta payload — an ordered list of image descriptors:
//   { publicId: "...", alt }  → existing image (kept, optionally re-ordered)
//   { file: <index>, alt }    → new upload from req.files[<index>]
// Absent/invalid → null (callers fall back to the legacy behavior).
const parseImagesMeta = (value) => {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// Sanitize admin-provided alt text (single line, bounded length).
const sanitizeAlt = (value) => {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
};

const generateSlug = async (name) => {
  let slug = slugify(name, { lower: true, strict: true });
  let existingProduct = await Product.findOne({ slug });
  let counter = 1;

  while (existingProduct) {
    slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
    existingProduct = await Product.findOne({ slug });
    counter++;
  }

  return slug;
};

// ==================== CONCURRENT CLOUDINARY UPLOADS ====================
// Product images used to be uploaded with sequential awaits:
//   for (const file of req.files) await uploadToCloudinary(...)
// With up to 5 images that is 5 serial network round-trips (each typically
// 300–800ms), which dominated the Add/Update Product POST latency. Uploads
// are now run with a small bounded concurrency window — the EXACT same
// Cloudinary calls, folders, public_id behavior and RESULT ORDER (results
// are indexed back into their input position) — so behavior is identical,
// just faster. A rejection propagates exactly like a sequential await, so
// the existing try/catch + 500 handling is preserved and no database write
// happens unless every upload succeeded.
const UPLOAD_CONCURRENCY = 3;

/**
 * Upload an array of buffers to Cloudinary with bounded concurrency,
 * preserving the input order of results.
 *
 * Failure contract: when ANY upload rejects, the original error is re-thrown
 * with a `partialUploads` property carrying every upload that SUCCEEDED before
 * the failure (in request order) so callers can roll back exactly the assets
 * created by this request — never existing product images.
 *
 * @param {Array<{file: {buffer: Buffer}, alt?: string}>} jobs
 * @param {string} folderName
 * @returns {Promise<Array<{url: string, public_id: string, alt?: string}>>}
 * @throws {Error & { partialUploads?: Array<{url: string, public_id: string, alt?: string}> }}
 */
async function uploadImagesConcurrently(jobs, folderName = "irhasinn/products") {
  const uploadStart = Date.now();
  debugLog(`[PERF] Cloudinary: starting ${jobs.length} uploads (${UPLOAD_CONCURRENCY} workers)`);
  const results = new Array(jobs.length);
  let cursor = 0;
  // Once any worker fails, remaining queued jobs are skipped so we never
  // upload images we would only have to delete again.
  let cancelled = false;

  const worker = async () => {
    while (cursor < jobs.length) {
      if (cancelled) break;
      const idx = cursor++;
      const { file, alt } = jobs[idx];
      try {
        const result = await uploadToCloudinary(file.buffer, folderName);
        results[idx] = {
          url: result.secure_url,
          public_id: result.public_id,
          ...(alt !== undefined ? { alt } : {}),
        };
      } catch (uploadErr) {
        cancelled = true;
        throw uploadErr;
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, jobs.length) },
    () => worker(),
  );

  // allSettled (not all) so every in-flight upload finishes before we compute
  // the partial list — a sibling worker may still be uploading when another
  // one fails, and those late successes must also be rolled back.
  const settled = await Promise.allSettled(workers);
  debugLog(`[PERF] Cloudinary: ${jobs.length} uploads completed in ${Date.now() - uploadStart}ms`);
  const failure = settled.find((s) => s.status === "rejected");
  if (failure) {
    const original =
      failure.reason instanceof Error
        ? failure.reason
        : new Error(String(failure.reason));
    original.partialUploads = results.filter(Boolean);
    throw original;
  }
  return results;
}

/**
 * Best-effort rollback of Cloudinary assets uploaded during THIS request.
 * Only the public_ids passed in are deleted — existing product images and
 * unrelated assets are never touched. Failures are logged but never thrown,
 * so the original operation error is always preserved.
 */
async function rollbackCloudinaryUploads(images) {
  if (!Array.isArray(images) || images.length === 0) return;
  await Promise.allSettled(
    images.map((img) =>
      deleteFromCloudinary(img.public_id).catch((deleteError) => {
        console.error(
          "Error rolling back product image upload:",
          deleteError?.message || deleteError,
        );
      }),
    ),
  );
}

// ==================== 1. CREATE PRODUCT (ADMIN) ====================

export const addProduct = async (req, res, next) => {
  let productCreated = false;
  try {
    const {
      name,
      description,
      price,
      category,
      subcategory,
      brand,
      stock,
      colors,
      sizes,
      tags,
      shippingCharge,
      freeShipping,
      customizable,
      customizationFields,
      showCustomizationPreview,
      printLayout,
      variantPricing,
      variantStock,
    } = req.body;

    // Normalize category
    let categoryId = category;
    if (categoryId && typeof categoryId === "object" && categoryId._id) {
      categoryId = categoryId._id;
    }

    // Normalize subcategory
    let subcategoryId = subcategory;
    if (subcategoryId && typeof subcategoryId === "object" && subcategoryId._id) {
      subcategoryId = subcategoryId._id;
    }

    // Validation
    if (!name?.trim()) return next(createError(400, "Product name is required"));
    if (!description?.trim()) return next(createError(400, "Product description is required"));
    if (!categoryId || typeof categoryId !== "string") return next(createError(400, "Category is required"));
    if (!brand?.trim()) return next(createError(400, "Brand is required"));
    if (!req.files || req.files.length === 0) return next(createError(400, "At least one product image is required"));

    // Check category exists
    const categoryExists = await Category.findById(categoryId);
    if (!categoryExists) return next(createError(404, "Category not found"));

    const isSizeBasedCategory = categoryExists.usesSizeBasedPricing === true;
    if (!isSizeBasedCategory && (!price || price <= 0)) {
      return next(createError(400, "Valid product price is required"));
    }

    // Validate subcategory if provided
    if (subcategoryId) {
      const subcategoryExists = await Subcategory.findById(subcategoryId);
      if (!subcategoryExists) return next(createError(404, "Subcategory not found"));
      if (String(subcategoryExists.parentCategory) !== String(categoryId)) {
        return next(createError(400, "Subcategory does not belong to the selected category"));
      }
    }

    // Build upload jobs from imagesMeta (but don't upload yet)
    const imagesMeta = parseImagesMeta(req.body.imagesMeta);
    const uploadJobs = [];
    if (Array.isArray(imagesMeta) && imagesMeta.length > 0) {
      const seenFileRefs = new Set();
      for (const entry of imagesMeta) {
        const idx = Number(entry?.file);
        const file = Number.isInteger(idx) && idx >= 0 && idx < req.files.length ? req.files[idx] : null;
        if (!file) continue;
        if (seenFileRefs.has(idx)) continue;
        seenFileRefs.add(idx);
        uploadJobs.push({ file, alt: sanitizeAlt(entry.alt) });
      }
    } else {
      for (const file of req.files) uploadJobs.push({ file });
    }
    if (uploadJobs.length === 0) return next(createError(400, "At least one product image is required"));

    // Duplicate check: prevent creating two products with the same name + category.
    // This guards against accidental double-submits on the admin form.
    const existingProduct = await Product.findOne({
      name: { $regex: `^${escapeRegExp(name.trim())}$`, $options: "i" },
      category: categoryId,
    });
    if (existingProduct) {
      return next(createError(409, "A product with this name already exists in this category"));
    }

    // Generate unique slug
    const slug = await generateSlug(name);

    // Parse variant stock/pricing
    const parsedVariantStock = variantStock ? (typeof variantStock === "string" ? JSON.parse(variantStock) : variantStock) : {};
    const parsedVariantPricing = variantPricing ? (typeof variantPricing === "string" ? JSON.parse(variantPricing) : variantPricing) : {};
    const hasVariants = parsedVariantStock && typeof parsedVariantStock === "object" && Object.keys(parsedVariantStock).length > 0;
    const derivedStock = hasVariants
      ? Object.values(parsedVariantStock).reduce((s, v) => s + (Number(v) || 0), 0)
      : (Number(stock) || 0);

    // Create product FIRST with empty images — respond immediately
    const product = await Product.create({
      name: name.trim(),
      slug,
      description: description.trim(),
      brand: brand.trim(),
      price: Number(price),
      category: categoryId,
      subcategory: subcategoryId || null,
      stock: derivedStock,
      colors: parseArray(colors),
      sizes: parseArray(sizes),
      tags: mergeDefaultTags(parseArray(tags)),
      variantPricing: parsedVariantPricing,
      variantStock: parsedVariantStock,
      shippingCharge: Number(shippingCharge) || 0,
      freeShipping: freeShipping === true || freeShipping === "true",
      customizable: customizable === true || customizable === "true",
      showCustomizationPreview: showCustomizationPreview !== undefined ? (showCustomizationPreview === true || showCustomizationPreview === "true") : true,
      customizationFields: customizationFields ? (typeof customizationFields === "string" ? JSON.parse(customizationFields) : customizationFields) : [],
      printLayout: parseJsonField(printLayout),
      images: [], // empty — uploaded in background
      user: req.user.id,
      addedBy: req.user.id,
      imageProcessingStatus: "pending",
    });
    productCreated = true;

    // Add product to category
    await Category.findByIdAndUpdate(categoryId, { $push: { products: product._id } }, { new: true });

    // Populate in-memory
    await product.populate("category", "name slug");
    await product.populate("user", "username email");

    // Invalidate caches
    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await invalidateCategoriesCache();

    // Respond IMMEDIATELY — images upload in background
    res.status(201).json(createSuccess(201, "Product created successfully", product));

    // ── Background image upload (runs AFTER response is sent) ──
    const productId = product._id;
    runAfterResponse(async () => {
      let uploadedImages = [];
      try {
        await Product.findByIdAndUpdate(productId, { imageProcessingStatus: "processing" });
        uploadedImages = await uploadImagesConcurrently(uploadJobs);
        if (uploadedImages.length === 0) throw new Error("No images uploaded");
        await Product.findByIdAndUpdate(productId, {
          images: uploadedImages,
          imageProcessingStatus: "complete",
          imageProcessingError: null,
        });
        debugLog(`[Product] Background upload complete for product ${productId}: ${uploadedImages.length} images`);
      } catch (uploadError) {
        console.error(`[Product] Background upload FAILED for product ${productId}:`, uploadError?.message || uploadError);
        // Roll back any partial uploads
        await rollbackCloudinaryUploads(uploadedImages);
        await Product.findByIdAndUpdate(productId, {
          imageProcessingStatus: "failed",
          imageProcessingError: uploadError?.message || "Image upload failed",
        });
      }
    }, `product-image-upload-${productId}`);
  } catch (error) {
    next(error);
  }
};

// ==================== 2. GET ALL PRODUCTS (WITH FILTERS & PAGINATION) ====================

export const getProducts = async (req, res, next) => {
  try {
    // Redis cache-aside: the key covers every query parameter that changes
    // the result. On a hit the DB is skipped entirely; on a miss the fresh
    // result is cached below (best-effort).
    const cacheKey = listCacheKey("products:list:main:", req.query);
    const cached = await safeGet(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Products fetched successfully", cached));
    }

    const {
      category,
      subcategory,
      search,
      minPrice,
      maxPrice,
      brand,
      colors,
      sizes,
      minRating,
      page = 1,
      limit = 12,
      sort,
    } = req.query;

    const filter = {};

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Subcategory filter (must be combined with a category for meaningful
    // results — the backend is the authoritative filter, not the frontend).
    if (subcategory) {
      filter.subcategory = subcategory;
    }

    // Search filter (name, description, tags) — escape regex
    // special characters so user input is treated literally.
    if (search) {
      const safeSearch = escapeRegExp(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
        { tags: { $in: [new RegExp(safeSearch, "i")] } },
      ];
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Brand filter
    if (brand) {
      filter.brand = { $regex: brand, $options: "i" };
    }

    // Color filter — comma-separated values, case-insensitive match against
    // the product's colors array (server-side so the products page never has
    // to download the whole catalog to filter by color).
    if (colors) {
      const colorArr = colors
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      if (colorArr.length > 0) {
        filter.colors = {
          $in: colorArr.map(
            (c) => new RegExp(`^${escapeRegExp(c)}$`, "i")
          ),
        };
      }
    }

    // Size filter — comma-separated values, case-insensitive match against
    // the product's sizes array.
    if (sizes) {
      const sizeArr = sizes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (sizeArr.length > 0) {
        filter.sizes = {
          $in: sizeArr.map(
            (s) => new RegExp(`^${escapeRegExp(s)}$`, "i")
          ),
        };
      }
    }

    // Minimum rating filter
    if (minRating) {
      const rating = Number(minRating);
      if (Number.isFinite(rating) && rating > 0) {
        filter.averageRating = { $gte: rating };
      }
    }

    // Stock filter (only in-stock products).
    // For variant-managed products, the main stock field may be 0 while
    // variants have available stock. Use a broad $or filter that catches
    // both cases, then post-filter for accuracy.
    //
    // F-001 FIX: When a search filter is active, the search $or must be
    // preserved. Previously this line blindly overwrote filter.$or, which
    // meant `?search=mug` returned the newest in-stock products instead of
    // matching products. Combine both conditions with $and so results are:
    //   (in-stock) AND (name/desc/tags match search)
    const stockFilter = buildBroadInStockFilter();
    if (filter.$or) {
      const searchCondition = filter.$or;
      delete filter.$or;
      filter.$and = [{ $or: searchCondition }, { $or: stockFilter }];
    } else {
      filter.$or = stockFilter;
    }

    // Sorting options
    let sortOption = { createdAt: -1 }; // Default: newest first
    if (sort) {
      switch (sort) {
        case "price-low":
          sortOption = { price: 1 };
          break;
        case "price-high":
          sortOption = { price: -1 };
          break;
        case "rating":
          sortOption = { averageRating: -1 };
          break;
        case "popular":
          sortOption = { sold: -1 };
          break;
        case "trending":
          sortOption = { "ratings.length": -1 };
          break;
        default:
          sortOption = { createdAt: -1 };
      }
    }

    // Guard against malformed/missing params: Number("abc") is NaN, which
    // previously flowed into .skip()/.limit() (unbounded/500). Non-finite
    // values now fall back to the same defaults the destructuring uses.
    const pageNum = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;
    const limitNum = Number.isFinite(Number(limit))
      ? Math.min(100, Math.max(1, Number(limit)))
      : 12;
    const skip = (pageNum - 1) * limitNum;

    // Fetch more than needed to compensate for post-filtering (variant
    // products where all variant stocks are 0 pass the broad $or but must
    // be removed). We request a modest oversample, then trim + paginate.
    const OVERSAMPLE = Math.max(limitNum * 2, limitNum + 20);
    const rawProducts = await Product.find(filter)
      .populate("category", "name slug")
      .populate("subcategory", "name slug")
      .populate("user", "username email")
      .sort(sortOption)
      .skip(skip)
      .limit(OVERSAMPLE)
      .select("-__v")
      .lean();

    // Remove truly out-of-stock variant products
    const products = filterInStockProducts(rawProducts).slice(0, limitNum);

    // Approximate count — the broad filter may slightly overcount for
    // variant products where every variant is 0, but exact count would
    // require an aggregation pipeline. The frontend already uses
    // hasNextPage for navigation so the small inaccuracy is acceptable.
    const totalProducts = await Product.countDocuments(filter);

    const payload = {
      products,
      pagination: {
        totalProducts,
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        hasNextPage: pageNum < Math.ceil(totalProducts / limitNum),
        hasPrevPage: pageNum > 1,
      },
    };

    // Best-effort cache write — a failure here must never affect the
    // response the user receives.
    await safeSet(cacheKey, payload, LIST_CACHE_TTL);

    res.status(200).json(
      createSuccess(200, "Products fetched successfully", payload),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 2b. GET ALL PRODUCTS (ADMIN-FACING, ROLE-SCOPED) ====================

export const getAdminProducts = async (req, res, next) => {
  try {
    // F-13: server-side search/category/subcategory filtering. The SAME
    // filter object drives find() and countDocuments(), so the admin page's
    // "Showing X–Y of Z" totals always match the rows returned. Admin lists
    // intentionally include out-of-stock products.
    const filter = buildAdminProductFilter(req.query);

    // All admins see all products (no reseller scoping)

    // The cap stays at 100 for backwards compatibility with any caller that
    // passes a larger limit — the admin page now paginates properly instead
    // of asking for 500 and being silently truncated.
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [products, totalProducts] = await Promise.all([
      Product.find(filter)
        .populate("category", "name slug")
        .populate("subcategory", "name slug")
        .populate("user", "username email")
        .populate("addedBy", "username email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v")
        .lean(),
      Product.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json(
      createSuccess(200, "Admin products fetched successfully", {
        products,
        pagination: {
          totalProducts,
          currentPage: page,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      }),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 3. GET SINGLE PRODUCT BY ID ====================

export const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Redis cache-aside (best-effort) — caches the fully populated document
    // exactly as the endpoint currently returns it (ratings/user populates
    // preserved). A cache miss falls through to the identical DB query below.
    const cacheKey = `products:detail:${id}`;
    const cached = await safeGet(cacheKey);
    if (cached) {
      return res.status(200).json(createSuccess(200, "Product found", cached));
    }

    const product = await Product.findById(id)
      .populate("category", "name slug description")
      .populate("subcategory", "name slug")
      .populate("user", "username email profilePic")
      .populate("ratings.user", "username email profilePic")
      .lean();

    if (!product) {
      return next(createError(404, "Product not found"));
    }

    // Best-effort cache write — a failure here must never affect the response.
    await safeSet(cacheKey, product, DETAIL_CACHE_TTL);

    res.status(200).json(createSuccess(200, "Product found", product));
  } catch (error) {
    next(error);
  }
};

// ==================== 4. RATE PRODUCT ====================

export const rateProduct = async (req, res, next) => {
  try {
    const { star, comment } = req.body;
    const { id: productId } = req.params;
    const userId = req.user.id;

    // Validate rating
    if (!star || star < 1 || star > 5) {
      return next(createError(400, "Star rating must be between 1 and 5"));
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return next(createError(404, "Product not found"));
    }

    // Check if user already rated this product
    const existingRatingIndex = product.ratings.findIndex(
      (r) => r.user.toString() === userId.toString(),
    );

    if (existingRatingIndex !== -1) {
      // Update existing rating
      product.ratings[existingRatingIndex].star = star;
      product.ratings[existingRatingIndex].comment =
        comment || product.ratings[existingRatingIndex].comment;
      product.ratings[existingRatingIndex].reviewDate = new Date();
    } else {
      // Add new rating
      product.ratings.push({
        user: userId,
        star: Number(star),
        comment: comment?.trim() || "",
        reviewDate: new Date(),
      });
    }

    // Calculate average rating
    const totalStars = product.ratings.reduce(
      (acc, item) => acc + item.star,
      0,
    );
    product.averageRating =
      Math.round((totalStars / product.ratings.length) * 10) / 10;
    product.totalReviews = product.ratings.length;

    await product.save();

    // Ratings feed the "rating"/"popular" listing sorts and the product
    // detail page — refresh the listing + detail caches.
    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await invalidateProductDetail(productId);

    // Populate in-memory (avoids redundant DB re-fetch)
    await product.populate("ratings.user", "username email profilePic");

    res
      .status(200)
      .json(createSuccess(200, "Rating added successfully", product));
  } catch (error) {
    next(error);
  }
};

// ==================== 6. DELETE RATING/REVIEW ====================

export const deleteRating = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const userId = req.user.id;
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "superadmin" ||
      req.user.isAdmin;

    const product = await Product.findById(productId);
    if (!product) {
      return next(createError(404, "Product not found"));
    }

    let ratingIndex;
    // Admins may delete any review by passing its reviewId; otherwise only
    // the review's own author can delete it (ownership enforced server-side).
    const reviewId = req.body?.reviewId || req.query?.reviewId;
    if (isAdmin && reviewId) {
      ratingIndex = product.ratings.findIndex(
        (r) => r._id.toString() === reviewId.toString(),
      );
    } else {
      ratingIndex = product.ratings.findIndex(
        (r) => r.user.toString() === userId.toString(),
      );
    }

    if (ratingIndex === -1) {
      return next(createError(404, "Rating not found"));
    }

    product.ratings.splice(ratingIndex, 1);

    // Recalculate average rating
    if (product.ratings.length > 0) {
      const totalStars = product.ratings.reduce(
        (acc, item) => acc + item.star,
        0,
      );
      product.averageRating =
        Math.round((totalStars / product.ratings.length) * 10) / 10;
    } else {
      product.averageRating = 0;
    }

    product.totalReviews = product.ratings.length;
    await product.save();

    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await invalidateProductDetail(productId);

    res.status(200).json(createSuccess(200, "Rating deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// ==================== 7. GET PRODUCT REVIEWS ====================

export const getProductReviews = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const { page = 1, limit = 10, sort = "latest" } = req.query;

    const product = await Product.findById(productId).populate(
      "ratings.user",
      "username email profilePic",
    );
    if (!product) {
      return next(createError(404, "Product not found"));
    }

    let ratings = [...product.ratings];

    // Sort reviews
    if (sort === "latest") {
      ratings.sort((a, b) => new Date(b.reviewDate) - new Date(a.reviewDate));
    } else if (sort === "highest") {
      ratings.sort((a, b) => b.star - a.star);
    } else if (sort === "lowest") {
      ratings.sort((a, b) => a.star - b.star);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const reviews = ratings.slice(skip, skip + limitNum);

    res.status(200).json(
      createSuccess(200, "Reviews fetched successfully", {
        reviews,
        totalReviews: product.ratings.length,
        currentPage: pageNum,
        totalPages: Math.ceil(product.ratings.length / limitNum),
      }),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 8. UPDATE PRODUCT ====================

export const updateProduct = async (req, res, next) => {
  // Images uploaded to Cloudinary during THIS update request — rolled back only
  // if the save fails (existing product images are never touched).
  let newlyUploadedImages = [];
  try {
    const { id: productId } = req.params;
    const {
      name,
      description,
      price,
      category,
      subcategory,
      brand,
      stock,
      colors,
      sizes,
      tags,
      shippingCharge,
      freeShipping,
      customizable,
      customizationFields,
      showCustomizationPreview,
      printLayout,
      printLayoutStatus,
      printLayoutError,
      removeImageIds,
      variantPricing,
      variantStock,
    } = req.body;

    // Normalize category — the admin form used to send a POPULATED category
    // object here, which FormData stringified to "[object Object]" and caused
    // a 500 ObjectId CastError. Accept a string id OR an object with an _id.
    let categoryId = category;
    if (categoryId && typeof categoryId === "object" && categoryId._id) {
      categoryId = categoryId._id;
    }

    // Normalize subcategory the same way (populated object → id string).
    let subcategoryId = subcategory;
    if (subcategoryId && typeof subcategoryId === "object" && subcategoryId._id) {
      subcategoryId = subcategoryId._id;
    }

    const product = await Product.findById(productId);
    if (!product) {
      return next(createError(404, "Product not found"));
    }



    // Update basic fields
    if (name?.trim()) {
      const trimmedName = name.trim();
      if (trimmedName !== product.name) {
        product.name = trimmedName;
        // Generate a new slug ONLY when the name actually changes. The slug
        // generator appends uniqueness suffixes when the slug already exists
        // (it finds this product's own current slug), so regenerating it on
        // every save would silently rewrite the product URL each time.
        product.slug = await generateSlug(trimmedName);
      }
    }

    if (description?.trim()) product.description = description.trim();
    if (brand?.trim()) product.brand = brand.trim();
    if (stock !== undefined) product.stock = Math.max(0, Number(stock));

    // Update arrays
    if (colors) product.colors = parseArray(colors);
    if (sizes) product.sizes = parseArray(sizes);
    if (tags) product.tags = mergeDefaultTags(parseArray(tags));

    // Update variant pricing (backward compatible — old products without this field work as before)
    if (variantPricing !== undefined) {
      const parsed = typeof variantPricing === "string" ? JSON.parse(variantPricing) : variantPricing;
      const hasVariantPricing = parsed && typeof parsed === "object" && Object.keys(parsed).length > 0;
      product.variantPricing = hasVariantPricing ? parsed : {};

      // FIX: When variantPricing is present and non-empty, clear the flat price
      // to 0 so no stale base price survives alongside size-based prices.
      // This prevents the inconsistent state where both a flat price AND
      // variant prices exist simultaneously on the same product document.
      if (hasVariantPricing) {
        product.price = 0;
      }
    }

    // Update variant stock (backward compatible — old products without this field work as before)
    if (variantStock !== undefined) {
      const parsed = typeof variantStock === "string" ? JSON.parse(variantStock) : variantStock;
      product.variantStock = parsed && typeof parsed === "object" ? parsed : {};
    }

    // Now that variantPricing is resolved, set the flat price ONLY when
    // variantPricing is empty (flat pricing mode). This runs AFTER the
    // variantPricing block so the invariant is always enforced.
    const currentHasVariantPricing = product.variantPricing && typeof product.variantPricing === "object" && Object.keys(product.variantPricing).length > 0;
    if (currentHasVariantPricing) {
      // Defense in depth: if variantPricing exists, flat price must be 0
      product.price = 0;
    } else if (price && price > 0) {
      product.price = Number(price);
    }

    // When variant stock is present, auto-sync the derived main stock from
    // the total of all variant stocks.  This keeps the two fields consistent
    // so any legacy code that still reads `stock` sees the correct value.
    if (hasVariantInventory(product)) {
      product.stock = sumVariantStocks(product);
    }

    // Update shipping fields
    if (freeShipping !== undefined) product.freeShipping = freeShipping === true || freeShipping === "true";
    if (shippingCharge !== undefined) product.shippingCharge = Number(shippingCharge) || 0;

    // Update customization fields
    if (customizable !== undefined) product.customizable = customizable === true || customizable === "true";
    if (showCustomizationPreview !== undefined) product.showCustomizationPreview = showCustomizationPreview === true || showCustomizationPreview === "true";
    if (customizationFields) {
      const parsed = typeof customizationFields === "string" ? JSON.parse(customizationFields) : customizationFields;
      product.customizationFields = Array.isArray(parsed) ? parsed : [];
    }

    // Update the AI-detected print layout (only when explicitly provided).
    // A layout object present = analysis succeeded ("detected") — even a
    // customizable:false result is a valid analysis outcome. A null/absent
    // layout means nothing usable was produced.
    if (printLayout !== undefined) {
      const parsedLayout = parseJsonField(printLayout);
      product.printLayout = parsedLayout;
      if (printLayoutStatus === undefined) {
        // Derive ONLY the success side here. The product modal sends
        // printLayout (possibly null) on EVERY save, so a missing layout must
        // NOT be labelled "failed" — that state is set explicitly by the
        // list-level detection flow. Never-analyzed products stay
        // "not_detected"; a deliberately cleared layout keeps its last status
        // (the list badge derives from the layout object either way).
        if (parsedLayout) {
          product.printLayoutStatus = "detected";
          product.printLayoutError = null; // a new layout clears any old error
        } else if (!product.printLayoutStatus) {
          product.printLayoutStatus = "not_detected";
        }
      }
      debugLog(
        "[PrintLayout] [11] printLayout saved to MongoDB:",
        JSON.stringify(product.printLayout),
      );
    }

    // Persistent detection status / last error — written by the list-level
    // Detect/Re-detect flow so Admin → Products shows the state directly.
    if (printLayoutStatus !== undefined) {
      product.printLayoutStatus = ["not_detected", "detected", "failed"].includes(
        printLayoutStatus
      )
        ? printLayoutStatus
        : "not_detected";
    }
    if (printLayoutError !== undefined) {
      product.printLayoutError =
        typeof printLayoutError === "string" && printLayoutError.trim()
          ? printLayoutError.slice(0, 500)
          : null;
    }

    // Handle category change
    if (
      typeof categoryId === "string" &&
      categoryId !== product.category.toString()
    ) {
      await Category.findByIdAndUpdate(product.category, {
        $pull: { products: productId },
      });
      product.category = categoryId;
      await Category.findByIdAndUpdate(categoryId, {
        $push: { products: productId },
      });
    }

    // Subcategory — validated against the EFFECTIVE category (the newly
    // submitted one when a change is in flight, otherwise the product's
    // current category). Never trust the frontend alone.
    if (subcategoryId) {
      const effectiveCategory =
        typeof categoryId === "string" && categoryId
          ? categoryId
          : product.category;
      const subcategoryExists = await Subcategory.findById(subcategoryId);
      if (!subcategoryExists) {
        return next(createError(404, "Subcategory not found"));
      }
      if (
        String(subcategoryExists.parentCategory) !==
        String(effectiveCategory)
      ) {
        return next(
          createError(
            400,
            "Subcategory does not belong to the selected category",
          ),
        );
      }
      product.subcategory = subcategoryId;
    } else if (subcategoryId === "" || subcategory === "" || subcategory === null) {
      // Explicitly cleared → drop the subcategory (legacy products keep
      // working with category-only).
      product.subcategory = null;
    }

    // Authoritative image list (ordered + alt). Each descriptor references
    // either an EXISTING image by public_id (validated against the product so
    // arbitrary asset ids can't be injected) or a NEW upload by file index.
    // The admin's reordering / primary selection / alt text are all preserved.
    const imagesMeta = parseImagesMeta(req.body.imagesMeta);
    if (Array.isArray(imagesMeta)) {
      // ──────────────────────────────────────────────────────────────
      // UPLOAD-FIRST PATTERN: upload all new files FIRST, then build
      // the final images array from resolved results. No placeholder
      // objects ever exist in finalImages — structurally impossible
      // for an incomplete object to reach product.save().
      // ──────────────────────────────────────────────────────────────
      const keptById = new Map(product.images.map((img) => [img.public_id, img]));
      const uploadJobs = []; // { file, alt, metaIndex } — uploaded before array is built
      const entryTypes = []; // parallel to imagesMeta: 'existing' | 'new' | 'error'

      // PASS 1 — Validate entries and collect new files for upload.
      for (let i = 0; i < imagesMeta.length; i++) {
        const entry = imagesMeta[i];
        const alt = sanitizeAlt(entry?.alt);
        const publicId = entry?.publicId || entry?.public_id;
        if (typeof publicId === "string" && publicId) {
          const existing = keptById.get(publicId);
          if (!existing) {
            return next(createError(400, "Invalid image reference in image order"));
          }
          entryTypes.push({ type: "existing", alt, publicId, img: existing });
          keptById.delete(publicId);
        } else if (entry?.file !== undefined && req.files) {
          const idx = Number(entry.file);
          const file =
            Number.isInteger(idx) && idx >= 0 && idx < req.files.length
              ? req.files[idx]
              : null;
          if (!file) {
            return next(createError(400, "Invalid new image reference in image order"));
          }
          const jobIdx = uploadJobs.length;
          uploadJobs.push({ file, alt });
          entryTypes.push({ type: "new", jobIdx });
        } else {
          return next(createError(400, "Invalid image descriptor in image order"));
        }
      }

      // PASS 2 — Upload all new images concurrently (order preserved).
      let uploaded = [];
      if (uploadJobs.length > 0) {
        try {
          uploaded = await uploadImagesConcurrently(uploadJobs);
          newlyUploadedImages = uploaded;
        } catch (uploadError) {
          await rollbackCloudinaryUploads(uploadError?.partialUploads || []);
          console.error("Product image upload failed:", uploadError?.message || uploadError);
          return next(createError(500, "Image upload failed"));
        }
      }

      // PASS 3 — Build finalImages directly from resolved results.
      // Every element is a real {url, public_id, alt} object — no placeholders.
      const finalImages = entryTypes.map((entry, i) => {
        if (entry.type === "existing") {
          return {
            url: entry.img.url,
            public_id: entry.img.public_id,
            alt: entry.alt || entry.img.alt || "",
          };
        }
        // type === 'new'
        return uploaded[entry.jobIdx];
      });

      // Delete Cloudinary assets for images the admin removed (best-effort).
      await Promise.allSettled(
        [...keptById.values()].map(async (removed) => {
          try {
            await deleteFromCloudinary(removed.public_id);
          } catch (deleteError) {
            console.error("Error deleting removed product image:", deleteError);
          }
        }),
      );
      product.images = finalImages;
    } else {
      // Legacy path: explicit removal + append new uploads (deletions run
      // concurrently, uploads keep the existing order but run concurrently).
      if (removeImageIds && Array.isArray(removeImageIds)) {
        await Promise.allSettled(
          removeImageIds.map(async (publicId) => {
            try {
              await deleteFromCloudinary(publicId);
            } catch (deleteError) {
              console.error("Error deleting removed product image:", deleteError);
            }
          }),
        );
        product.images = product.images.filter(
          (img) => !removeImageIds.includes(img.public_id),
        );
      }

      // Handle new image uploads
      if (req.files && req.files.length > 0) {
        try {
          const jobs = req.files.map((file) => ({ file }));
          const uploaded = await uploadImagesConcurrently(jobs);
          // Remember exactly which assets THIS request created so a failed
          // save below rolls back only those.
          newlyUploadedImages = uploaded;
          product.images.push(...uploaded);
        } catch (uploadError) {
          // Partial uploads from this request must not become orphans.
          await rollbackCloudinaryUploads(uploadError?.partialUploads || []);
          console.error("Product image upload failed:", uploadError?.message || uploadError);
          return next(createError(500, "Image upload failed"));
        }
      }
    }

    // Persist the updated product. If the DB write fails, the images uploaded
    // by THIS request would be orphaned on Cloudinary — roll back exactly those
    // (existing images and admin-removed images are deliberately untouched).
    try {
      await product.save();
    } catch (saveError) {
      await rollbackCloudinaryUploads(newlyUploadedImages);
      return next(saveError);
    }

    // Price/stock/name/availability/category may have changed — cached
    // listings, the detail payload, and the category payload must never
    // show stale values to customers.
    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await invalidateProductDetail(productId);
    await invalidateCategoriesCache();

    // Populate in-memory (avoids redundant DB re-fetch)
    await product.populate("category", "name slug");
    await product.populate("subcategory", "name slug");
    await product.populate("user", "username email");
    await product.populate("ratings.user", "username profilePic");

    res
      .status(200)
      .json(createSuccess(200, "Product updated successfully", product));
  } catch (error) {
    next(error);
  }
};

// ==================== 8b. BATCH PRODUCT EXISTENCE CHECK ====================
// Accepts an array of product IDs and returns only those that still exist.
// Used by the client-side Recently Viewed component to filter out deleted
// products without fetching full product data.

export const checkProductsExist = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(200).json(createSuccess(200, "No IDs provided", []));
    }

    // Cap at 20 IDs to prevent abuse
    const cappedIds = ids.slice(0, 20);

    const existing = await Product.find({ _id: { $in: cappedIds } })
      .select("_id")
      .lean();

    const existingIds = existing.map((p) => String(p._id));

    return res
      .status(200)
      .json(createSuccess(200, "Existence check complete", existingIds));
  } catch (error) {
    next(error);
  }
};

// ==================== 8b. RETRY FAILED IMAGE UPLOAD ====================
// Re-attempts background image upload for a product whose previous attempt failed.
// The admin provides new image files via multipart; the old failed attempt's
// partial uploads are rolled back, and the new images are uploaded.
export const retryImageUpload = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) return next(createError(404, "Product not found"));

    if (product.imageProcessingStatus !== "failed") {
      return next(createError(400, "This product does not have a failed image upload to retry"));
    }

    if (!req.files || req.files.length === 0) {
      return next(createError(400, "Please provide images to upload"));
    }

    // Build upload jobs from new files
    const imagesMeta = parseImagesMeta(req.body.imagesMeta);
    const uploadJobs = [];
    if (Array.isArray(imagesMeta) && imagesMeta.length > 0) {
      const seenFileRefs = new Set();
      for (const entry of imagesMeta) {
        const idx = Number(entry?.file);
        const file = Number.isInteger(idx) && idx >= 0 && idx < req.files.length ? req.files[idx] : null;
        if (!file) continue;
        if (seenFileRefs.has(idx)) continue;
        seenFileRefs.add(idx);
        uploadJobs.push({ file, alt: sanitizeAlt(entry.alt) });
      }
    } else {
      for (const file of req.files) uploadJobs.push({ file });
    }

    if (uploadJobs.length === 0) {
      return next(createError(400, "No valid images to upload"));
    }

    // Mark as processing and respond immediately
    await Product.findByIdAndUpdate(productId, { imageProcessingStatus: "processing", imageProcessingError: null });

    // Respond immediately — upload in background
    res.status(200).json(createSuccess(200, "Image retry started", { status: "processing" }));

    const pid = product._id;
    runAfterResponse(async () => {
      let uploadedImages = [];
      try {
        uploadedImages = await uploadImagesConcurrently(uploadJobs);
        if (uploadedImages.length === 0) throw new Error("No images uploaded");
        await Product.findByIdAndUpdate(pid, {
          images: uploadedImages,
          imageProcessingStatus: "complete",
          imageProcessingError: null,
        });
        debugLog(`[Product] Retry upload complete for product ${pid}: ${uploadedImages.length} images`);
      } catch (uploadError) {
        console.error(`[Product] Retry upload FAILED for product ${pid}:`, uploadError?.message || uploadError);
        await rollbackCloudinaryUploads(uploadedImages);
        await Product.findByIdAndUpdate(pid, {
          imageProcessingStatus: "failed",
          imageProcessingError: uploadError?.message || "Image upload failed",
        });
      }
    }, `product-image-retry-${pid}`);
  } catch (error) {
    next(error);
  }
};

// ==================== 9. DELETE PRODUCT ====================

export const deleteProduct = async (req, res, next) => {
  try {
    const { id: productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return next(createError(404, "Product not found"));
    }



    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      try {
        for (const image of product.images) {
          await deleteFromCloudinary(image.public_id);
        }
      } catch (deleteError) {
        console.error("Error deleting images from Cloudinary:", deleteError);
      }
    }

    // Remove product from category
    await Category.findByIdAndUpdate(product.category, {
      $pull: { products: productId },
    });

    // ── Cleanup orphaned references across collections ──
    // These are non-blocking best-effort: a cleanup failure must not prevent
    // the product from being deleted, and stale entries are tolerable (they
    // show as empty/missing in the UI, not as errors).
    await Promise.allSettled([
      // Remove from every user's wishlist
      Users.updateMany({}, { $pull: { wishlist: productId } }),
      // Remove from every user's cart (embedded subdocument with `product` field)
      Users.updateMany({}, { $pull: { cart: { product: productId } } }),
      // Null out productId on product-based conversations (the frontend
      // already handles null gracefully with a "this product" fallback)
      Conversation.updateMany({ productId }, { $set: { productId: null } }),
    ]);

    // Delete product
    await Product.findByIdAndDelete(productId);

    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await invalidateProductDetail(productId);
    await invalidateCategoriesCache();

    res.status(200).json(createSuccess(200, "Product deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// ==================== 10. GET TRENDING PRODUCTS ====================

export const getTrendingProducts = async (req, res, next) => {
  try {
    const { limit = 8 } = req.query;

    const rawProducts = await Product.find({ $or: buildBroadInStockFilter() })
      .populate("category", "name slug")
      .populate("user", "username email")
      .sort({ sold: -1, averageRating: -1 })
      .limit(Number(limit) * 2);
    const products = filterInStockProducts(rawProducts).slice(0, Number(limit));

    res
      .status(200)
      .json(createSuccess(200, "Trending products fetched", products));
  } catch (error) {
    next(error);
  }
};

// ==================== 11. GET TOP RATED PRODUCTS ====================

export const getTopRatedProducts = async (req, res, next) => {
  try {
    const { limit = 8 } = req.query;

    const rawProducts = await Product.find({
      $or: buildBroadInStockFilter(),
      averageRating: { $gt: 0 },
    })
      .populate("category", "name slug")
      .populate("user", "username email")
      .sort({ averageRating: -1, totalReviews: -1 })
      .limit(Number(limit) * 2);
    const products = filterInStockProducts(rawProducts).slice(0, Number(limit));

    res
      .status(200)
      .json(createSuccess(200, "Top rated products fetched", products));
  } catch (error) {
    next(error);
  }
};

// ==================== 12. GET RECOMMENDED PRODUCTS ====================

export const getRecommendedProducts = async (req, res, next) => {
  try {
    const { categoryId, limit = 8 } = req.query;

    if (!categoryId) {
      return next(createError(400, "Category ID is required"));
    }

    const rawProducts = await Product.find({
      category: categoryId,
      $or: buildBroadInStockFilter(),
    })
      .populate("category", "name slug")
      .populate("user", "username email")
      .sort({ averageRating: -1, createdAt: -1 })
      .limit(Number(limit) * 2);
    const products = filterInStockProducts(rawProducts).slice(0, Number(limit));

    res
      .status(200)
      .json(createSuccess(200, "Recommended products fetched", products));
  } catch (error) {
    next(error);
  }
};

// ==================== 13. BULK UPDATE PRODUCT STOCK ====================

export const bulkUpdateStock = async (req, res, next) => {
  try {
    const { updates } = req.body; // [{id, stock}, {id, stock}, ...]

    if (!Array.isArray(updates) || updates.length === 0) {
      return next(createError(400, "Updates array is required"));
    }

    // Single batched DB write instead of N sequential findByIdAndUpdate calls.
    const bulkOps = updates
      .filter((u) => u.id)
      .map((u) => ({
        updateOne: {
          filter: { _id: u.id },
          update: { stock: Math.max(0, Number(u.stock) || 0) },
        },
      }));

    const result = bulkOps.length > 0
      ? await Product.bulkWrite(bulkOps, { ordered: false })
      : { modifiedCount: 0 };

    // Bulk stock edits change availability — refresh cached listings and
    // every affected product's detail payload.
    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await Promise.allSettled(
      updates.map((u) => invalidateProductDetail(u?.id)),
    );

    res.status(200).json(
      createSuccess(200, "Stock updated successfully", {
        updated: result.modifiedCount,
      }),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 14. GET PRODUCT STATISTICS ====================

export const getProductStats = async (req, res, next) => {
  try {
    const totalProducts = await Product.countDocuments();
    const productsInStock = await Product.countDocuments({ $or: buildBroadInStockFilter() });
    const productsOutOfStock = await Product.countDocuments({
      $and: [
        { stock: { $lte: 0 } },
        { $or: [{ variantStock: { $exists: false } }, { variantStock: {} }] },
      ],
    });
    const averagePrice = await Product.aggregate([
      { $group: { _id: null, avg: { $avg: "$price" } } },
    ]);
    const averageRating = await Product.aggregate([
      { $group: { _id: null, avg: { $avg: "$averageRating" } } },
    ]);
    const totalSold = await Product.aggregate([
      { $group: { _id: null, total: { $sum: "$sold" } } },
    ]);
    const totalReviews = await Product.aggregate([
      { $group: { _id: null, total: { $sum: "$totalReviews" } } },
    ]);

    res.status(200).json(
      createSuccess(200, "Product statistics fetched", {
        totalProducts,
        productsInStock,
        productsOutOfStock,
        averagePrice: averagePrice[0]?.avg || 0,
        averageRating: averageRating[0]?.avg || 0,
        totalSold: totalSold[0]?.total || 0,
        totalReviews: totalReviews[0]?.total || 0,
      }),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 15. SEARCH PRODUCTS (TEXT SEARCH) ====================

export const searchProducts = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 12 } = req.query;

    if (!q || q.trim().length === 0) {
      return next(createError(400, "Search query is required"));
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;
    const query = q.trim();

    // Build a relevance-weighted $or query:
    //   1. Exact / prefix name match  (highest relevance)
    //   2. Partial name / brand / category name match
    //   3. Description / tag match      (lowest relevance)
    //
    // We always require stock > 0 so out-of-stock items never surface
    // in search results.  The text index provides the broadest net;
    // the regex $or clauses add relevance ranking that $text alone
    // cannot express.
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    // Use broad in-stock filter (main stock OR variant stock)
    const stockOr = buildBroadInStockFilter();
    const OVERSAMPLE = Math.max(limitNum * 2, limitNum + 20);
    const rawProducts = await Product.find({
      $and: [
        { $or: stockOr },
        {
          $or: [
            // Tier 1 — strong name signals (prefix, word-boundary)
            { name: { $regex: new RegExp(`\\b${query}`, "i") } },
            { name: { $regex: regex } },
            // Tier 2 — brand and category
            { brand: regex },
            // Tier 3 — description and tags (weakest)
            { description: regex },
            { tags: { $in: [regex] } },
          ],
        },
      ],
    })
      .populate("category", "name slug")
      .sort({ sold: -1, averageRating: -1 })
      .skip(skip)
      .limit(OVERSAMPLE)
      .select("name slug price images averageRating stock brand colors sizes sold category variantStock");

    const products = filterInStockProducts(rawProducts).slice(0, limitNum);

    // Rough total for pagination (no need for exact count in a search dropdown)
    const totalResults = products.length === limitNum
      ? (await Product.countDocuments({
          $and: [
            { $or: stockOr },
            {
              $or: [
                { name: regex },
                { brand: regex },
                { description: regex },
                { tags: { $in: [regex] } },
              ],
            },
          ],
        }))
      : skip + products.length;

    res.status(200).json(
      createSuccess(200, "Search results", {
        products,
        pagination: {
          totalResults,
          currentPage: pageNum,
          totalPages: Math.ceil(totalResults / limitNum),
        },
      }),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 16. GET PRODUCTS BY CATEGORY ====================

export const getProductsByCategory = async (req, res, next) => {
  try {
    const { categorySlug } = req.params;
    const { page = 1, limit = 12, sort = "latest" } = req.query;

    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      return next(createError(404, "Category not found"));
    }

    let sortOption = { createdAt: -1 };
    if (sort === "price-low") sortOption = { price: 1 };
    if (sort === "price-high") sortOption = { price: -1 };
    if (sort === "rating") sortOption = { averageRating: -1 };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const OVERSAMPLE = Math.max(limitNum * 2, limitNum + 20);
    const rawProducts = await Product.find({
      category: category._id,
      $or: buildBroadInStockFilter(),
    })
      .populate("category", "name slug")
      .populate("user", "username email")
      .sort(sortOption)
      .skip(skip)
      .limit(OVERSAMPLE)
      .select("-__v");

    const products = filterInStockProducts(rawProducts).slice(0, limitNum);

    const totalProducts = await Product.countDocuments({
      category: category._id,
      $or: buildBroadInStockFilter(),
    });

    res.status(200).json(
      createSuccess(200, "Category products fetched", {
        category: {
          _id: category._id,
          name: category.name,
          slug: category.slug,
        },
        products,
        pagination: {
          totalProducts,
          currentPage: pageNum,
          totalPages: Math.ceil(totalProducts / limitNum),
        },
      }),
    );
  } catch (error) {
    next(error);
  }
};

// ==================== 17. GET RELATED PRODUCTS ====================

export const getRelatedProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 6 } = req.query;
    const limitNum = Math.min(10, Math.max(1, Number(limit) || 6));

    // F-007: cache related products per product + limit — every product page
    // view triggers this endpoint, and the results rarely change within a
    // minute. Short TTL avoids stale price/stock data while still cutting
    // the ~2 DB queries per page view to zero on cache hits.
    const cacheKey = `products:related:${id}:${limitNum}`;
    const cached = await safeGet(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Related products fetched", cached));
    }

    const product = await Product.findById(id).select("category").lean();

    if (!product) {
      return next(createError(404, "Product not found"));
    }

    // First try: same category, exclude self, in stock, sorted by rating & sold
    const overLimit = limitNum * 3;
    let rawRelated = await Product.find({
      _id: { $ne: id },
      category: product.category,
      $or: buildBroadInStockFilter(),
    })
      .populate("category", "name slug")
      .sort({ averageRating: -1, sold: -1, createdAt: -1 })
      .limit(overLimit)
      .select("-ratings -__v");
    let related = filterInStockProducts(rawRelated).slice(0, limitNum);

    // Fallback: if not enough same-category products, fill with popular products
    if (related.length < limitNum) {
      const existingIds = [id, ...related.map((p) => p._id.toString())];
      const rawPopular = await Product.find({
        _id: { $nin: existingIds },
        $or: buildBroadInStockFilter(),
      })
        .populate("category", "name slug")
        .sort({ sold: -1, averageRating: -1 })
        .limit((limitNum - related.length) * 3)
        .select("-ratings -__v");  // includes variantStock
      const popular = filterInStockProducts(rawPopular).slice(0, limitNum - related.length);

      related = [...related, ...popular];
    }

    // Best-effort cache write — 60s TTL matches the list cache.
    await safeSet(cacheKey, related, 60);

    // If there's nothing at all, return an empty array (section will be hidden)
    return res
      .status(200)
      .json(createSuccess(200, "Related products fetched", related));
  } catch (error) {
    next(error);
  }
};

// ==================== 18. SEARCH SUGGESTIONS (AUTOCOMPLETE) ====================

export const searchSuggestions = async (req, res, next) => {
  try {
    const { q, limit = 8 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(200).json(createSuccess(200, "No query", []));
    }

    // Cache-aside — autocomplete fires on every keystroke, so this is a
    // hot endpoint. Key covers q + limit.
    const cacheKey = listCacheKey("products:list:suggestions:", req.query);
    const cached = await safeGet(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Suggestions fetched", cached));
    }

    const limitNum = Math.min(12, Math.max(1, Number(limit) || 8));

    // Fast prefix/partial match using the existing text index or regex
    const rawProducts = await Product.find({
      $and: [
        { $or: buildBroadInStockFilter() },
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { tags: { $in: [new RegExp(q, "i")] } },
          ],
        },
      ],
    })
      .populate("category", "name slug")
      .sort({ sold: -1, averageRating: -1 })
      .limit(limitNum * 2)
      .select("name slug price images averageRating sold variantStock");
    const products = filterInStockProducts(rawProducts).slice(0, limitNum);

    await safeSet(cacheKey, products, LIST_CACHE_TTL);

    return res
      .status(200)
      .json(createSuccess(200, "Suggestions fetched", products));
  } catch (error) {
    next(error);
  }
};

// ==================== 19. UPDATE PRODUCT SOLD COUNT ====================

export const incrementProductSold = async (req, res, next) => {
  try {
    const { id: productId } = req.params;
    const { quantity = 1 } = req.body;

    const product = await Product.findByIdAndUpdate(
      productId,
      { $inc: { sold: Number(quantity), stock: -Number(quantity) } },
      { new: true },
    );

    if (!product) {
      return next(createError(404, "Product not found"));
    }

    // Sold count / stock changed — cached listings and the detail payload
    // would otherwise show stale popularity/availability.
    await invalidateProductListings();
    await invalidateRelatedProductsCache();
    await invalidateProductDetail(productId);

    res
      .status(200)
      .json(createSuccess(200, "Product sold count updated", product));
  } catch (error) {
    next(error);
  }
};
