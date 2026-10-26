import { Category } from "../Models/Category.js";
import { Subcategory } from "../Models/Subcategory.js";
import { Product } from "../Models/Product.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  derivePublicIdFromUrl,
} from "../utils/cloudinary.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { createSlug } from "../utils/commonFunctions.js";
import {
  safeGet,
  safeSet,
  invalidateCategoriesCache,
} from "../utils/redisCache.js";

// Cache TTL for the getAllCategories payload. Short enough that new/updated
// categories and product counts never stay stale long, long enough to cut the
// repeated homepage / admin / navbar DB load (this endpoint was measured at
// ~680-750ms warm). Any Redis issue falls back to the direct DB read below.
const CATEGORIES_CACHE_TTL = 300; // seconds

// Folder used for all category images on Cloudinary.
const CATEGORY_IMAGE_FOLDER = "irhasinn/Category";

// Resolve the Cloudinary public_id of a category's image for cleanup: prefer
// the stored imagePublicId; for legacy categories that only have the image URL
// (added before the field existed), derive it conservatively from the URL —
// returns null (skip cleanup) when the URL does not match the exact shape.
const getCategoryImagePublicId = (category) => {
  if (category.imagePublicId) return category.imagePublicId;
  if (category.image) {
    return derivePublicIdFromUrl(category.image, CATEGORY_IMAGE_FOLDER);
  }
  return null;
};

// ==========================================
// 1. CREATE CATEGORY
// ==========================================
export const createCategory = async (req, res, next) => {
  try {
    // 1. req.body se image bhi extract karein
    const { description, name, usesSizeBasedPricing } = req.body;
    let result;
    const file = req.file;
    try {
      result = await uploadToCloudinary(file.buffer, "irhasinn/Category");
    } catch (error) {
      return next(createError(500, "Image upload failed"));
    }
    if (!name || !description || !result?.url || !result?.public_id) {
      return next(
        createError(
          400,
          "All fields (name, description, and image) are required",
        ),
      );
    }

    const existing = await Category.findOne({ name });
    if (existing) {
      return next(createError(400, "Category already exists"));
    }

    if (!req.user || !req.user.id) {
      return next(
        createError(401, "You are not authenticated! Missing user info."),
      );
    }

    const image = result.secure_url;
    const category = new Category({
      name,
      description,
      image,
      imagePublicId: result.public_id,
      slug: createSlug(name),
      user: req.user.id,
      products: [],
      usesSizeBasedPricing: usesSizeBasedPricing === "true",
    });

    await category.save();

    // New category changes the getAllCategories payload.
    await invalidateCategoriesCache();

    res
      .status(201)
      .json(createSuccess(201, "Category created successfully", category));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. GET ALL CATEGORIES
// ==========================================
export const getCategories = async (req, res, next) => {
  try {
    // Redis cache-aside (best-effort): the response contract is preserved
    // exactly — products and subcategories stay populated as today, and the
    // cached value is the same array shape the DB query produces.
    const CACHE_KEY = "categories:all";
    const cached = await safeGet(CACHE_KEY);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Categories fetched successfully", cached));
    }

    // CRITICAL FIX: Never .populate("products") — that loads the ENTIRE
    // product catalog into memory per category. Instead, use a count query
    // so the UI can show product counts without fetching every document.
    const categories = await Category.find()
      .populate("user", "username email")
      .populate("subcategories");

    // Attach product counts to each category (fast count query, not full populate)
    const categoryIds = categories.map((c) => c._id);
    const Product = (await import("../Models/Product.js")).Product;
    const counts = await Product.aggregate([
      { $match: { category: { $in: categoryIds } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const c of counts) countMap[String(c._id)] = c.count;
    const categoriesWithCounts = categories.map((cat) => {
      const obj = cat.toObject ? cat.toObject() : { ...cat };
      obj.productCount = countMap[String(cat._id)] || 0;
      return obj;
    });

    // Best-effort cache write — a failure here must never affect the response.
    await safeSet(CACHE_KEY, categoriesWithCounts, CATEGORIES_CACHE_TTL);

    res
      .status(200)
      .json(createSuccess(200, "Categories fetched successfully", categoriesWithCounts));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. GET SINGLE CATEGORY (BY ID)
// ==========================================
export const getCategoryById = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate("user", "username email")
      .populate("subcategories");
    // Attach product count instead of full populate
    let payload = category;
    if (category) {
      const Product = (await import("../Models/Product.js")).Product;
      const productCount = await Product.countDocuments({ category: category._id });
      const obj = category.toObject ? category.toObject() : { ...category };
      obj.productCount = productCount;
      // For single-category view, provide a lightweight product list (id + name + price + images)
      const products = await Product.find({ category: category._id })
        .select("name price images slug stock")
        .sort({ createdAt: -1 })
        .limit(50);
      obj.products = products;
      payload = obj;
    }

    if (!category) {
      return next(createError(404, "Category not found"));
    }

    res.status(200).json(createSuccess(200, "Category found", payload));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. GET CATEGORY BY SLUG (SEO FRIENDLY)
// ==========================================
export const getCategoryBySlug = async (req, res, next) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug })
      .populate("user", "username email")
      .populate("subcategories");
    // Attach product count instead of full populate
    let payload = category;
    if (category) {
      const Product = (await import("../Models/Product.js")).Product;
      const productCount = await Product.countDocuments({ category: category._id });
      const obj = category.toObject ? category.toObject() : { ...category };
      obj.productCount = productCount;
      const products = await Product.find({ category: category._id })
        .select("name price images slug stock")
        .sort({ createdAt: -1 })
        .limit(50);
      obj.products = products;
      payload = obj;
    }

    if (!category) {
      return next(createError(404, "Category not found"));
    }

    res.status(200).json(createSuccess(200, "Category found", payload));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. UPDATE CATEGORY
// ==========================================
export const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return next(createError(404, "Category not found"));
    }

    // 1. Destructure image from req.body
    const { description, name, isActive, image, usesSizeBasedPricing } = req.body;

    if (name) {
      category.name = name;
      category.slug = createSlug(name);
    }

    if (description) {
      category.description = description;
    }

    if (typeof isActive === "boolean") {
      category.isActive = isActive;
    }

    if (usesSizeBasedPricing !== undefined) {
      category.usesSizeBasedPricing = usesSizeBasedPricing === "true" || usesSizeBasedPricing === true;
    }

    if (req.file) {
      // Capture the OLD asset BEFORE replacing it so the replaced image can be
      // cleaned up safely (never the new one).
      const oldPublicId = getCategoryImagePublicId(category);
      let result;
      try {
        result = await uploadToCloudinary(
          req.file.buffer,
          CATEGORY_IMAGE_FOLDER,
        );
      } catch (error) {
        return next(createError(500, "Image upload failed"));
      }
      // Only swap the stored fields (and clean up the replaced asset) when the
      // new upload returned BOTH a URL and a public_id — otherwise keep the old
      // image untouched rather than orphaning it.
      if (result?.secure_url && result?.public_id) {
        category.image = result.secure_url;
        category.imagePublicId = result.public_id;
        // Best-effort cleanup of the replaced asset — a failure here must never
        // fail the update (the new image is already saved in-memory above, and
        // an orphan is recoverable; deleting the wrong asset is not).
        if (oldPublicId && oldPublicId !== result.public_id) {
          try {
            await deleteFromCloudinary(oldPublicId);
          } catch (deleteError) {
            console.warn(
              "Failed to delete replaced category image from Cloudinary:",
              deleteError.message || deleteError,
            );
          }
        }
      }
    }

    await category.save();

    // Name/image/active status changed — the cached categories payload must
    // not show stale data.
    await invalidateCategoriesCache();

    res
      .status(200)
      .json(createSuccess(200, "Category updated successfully", category));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. DELETE CATEGORY
// ==========================================
export const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return next(createError(404, "Category not found"));
    }

    const productsCount = await Product.countDocuments({
      category: category._id,
    });

    if (productsCount > 0) {
      return next(
        createError(
          400,
          "Cannot delete category with products. Remove products first.",
        ),
      );
    }

    // Never silently orphan subcategories — require them to be removed first.
    const subcategoriesCount = await Subcategory.countDocuments({
      parentCategory: category._id,
    });

    if (subcategoriesCount > 0) {
      return next(
        createError(
          400,
          "Cannot delete category with subcategories. Remove subcategories first.",
        ),
      );
    }

    // Clean up the Cloudinary image (best-effort). Prefer the stored
    // imagePublicId; legacy categories fall back to a conservative URL
    // derivation that returns null (skip) unless the URL matches the exact
    // Cloudinary upload shape — an unrelated asset is never deleted.
    const imagePublicId = getCategoryImagePublicId(category);
    if (imagePublicId) {
      try {
        await deleteFromCloudinary(imagePublicId);
      } catch (deleteError) {
        console.warn(
          "Failed to delete category image from Cloudinary:",
          deleteError.message || deleteError,
        );
      }
    }

    await Category.findByIdAndDelete(req.params.id);

    await invalidateCategoriesCache();

    res.status(200).json(createSuccess(200, "Category deleted successfully"));
  } catch (error) {
    next(error);
  }
};
