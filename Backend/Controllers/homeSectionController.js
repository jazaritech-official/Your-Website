import { HomeSection } from "../Models/HomeSection.js";
import { Category } from "../Models/Category.js";
import { Subcategory } from "../Models/Subcategory.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { safeGet, safeSet, safeDel } from "../utils/redisCache.js";

// Cache TTL for the public homepage sections list (5 minutes). Section data
// rarely changes but is fetched on every homepage load; any Redis issue
// falls back to the direct DB read below.
const SECTION_CACHE_TTL = 300; // seconds
const sectionCacheKey = "homeSections";

/** Invalidate the homepage sections cache after any write. */
const invalidateSectionCache = async () => {
  await safeDel(sectionCacheKey);
};

// Subcategory must belong to the selected category — the backend is the
// authoritative validator (never only the frontend).
const validateSubcategory = async (categoryId, subcategoryId) => {
  if (!subcategoryId) return true; // optional — null means "all category products"
  const sub = await Subcategory.findOne({
    _id: subcategoryId,
    parentCategory: categoryId,
  });
  if (!sub) {
    throw createError(
      400,
      "Selected subcategory does not belong to the selected category",
    );
  }
  return true;
};

// ==========================================
// 1. GET SECTIONS (Public) — active only, ordered
// ==========================================
export const getSections = async (req, res, next) => {
  try {
    const cached = await safeGet(sectionCacheKey);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Home sections fetched successfully", cached));
    }

    const sections = await HomeSection.find({ isActive: true })
      .populate("category", "name slug")
      .populate("subcategory", "name slug")
      .sort({ order: 1 });

    safeSet(sectionCacheKey, sections, SECTION_CACHE_TTL);

    res
      .status(200)
      .json(createSuccess(200, "Home sections fetched successfully", sections));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. GET ALL SECTIONS (Admin) — includes inactive
// ==========================================
export const getAllSectionsAdmin = async (req, res, next) => {
  try {
    const sections = await HomeSection.find({})
      .populate("category", "name slug")
      .populate("subcategory", "name slug")
      .sort({ order: 1 });

    res
      .status(200)
      .json(createSuccess(200, "All home sections fetched successfully", sections));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. CREATE SECTION (Admin)
// ==========================================
export const createSection = async (req, res, next) => {
  try {
    const { category, subcategory, order, isActive } = req.body;

    if (!category) {
      return next(createError(400, "Category is required"));
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return next(createError(400, "Selected category does not exist"));
    }

    if (subcategory) {
      try {
        await validateSubcategory(category, subcategory);
      } catch (err) {
        return next(err);
      }
    }

    if (!req.file) {
      return next(createError(400, "Banner image file is required"));
    }

    let result;
    try {
      result = await uploadToCloudinary(req.file.buffer, "irhasinn/HomeSections");
    } catch (error) {
      return next(createError(500, "Image upload failed"));
    }

    if (!result?.secure_url || !result?.public_id) {
      return next(createError(500, "Image upload returned incomplete data"));
    }

    const section = new HomeSection({
      image: result.secure_url,
      imagePublicId: result.public_id,
      category,
      subcategory: subcategory || null,
      order: order !== undefined ? Number(order) : 0,
      isActive: isActive !== undefined
        ? isActive === true || isActive === "true"
        : true,
    });

    await section.save();

    invalidateSectionCache();

    res
      .status(201)
      .json(createSuccess(201, "Home section created successfully", section));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. UPDATE SECTION (Admin)
// ==========================================
export const updateSection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const section = await HomeSection.findById(id);

    if (!section) {
      return next(createError(404, "Home section not found"));
    }

    const { category, subcategory, order, isActive } = req.body;

    if (category && category !== String(section.category)) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return next(createError(400, "Selected category does not exist"));
      }
      section.category = category;
    }

    if (subcategory !== undefined) {
      const targetCategory = category && category !== String(section.category)
        ? category
        : String(section.category);
      if (subcategory) {
        try {
          await validateSubcategory(targetCategory, subcategory);
        } catch (err) {
          return next(err);
        }
      }
      section.subcategory = subcategory || null;
    }

    // If a new banner image is uploaded, delete the old one from Cloudinary
    if (req.file) {
      try {
        if (section.imagePublicId) {
          await deleteFromCloudinary(section.imagePublicId);
        }
      } catch (cloudErr) {
        console.warn("Failed to delete old Cloudinary image:", cloudErr.message);
      }

      let result;
      try {
        result = await uploadToCloudinary(req.file.buffer, "irhasinn/HomeSections");
      } catch (error) {
        return next(createError(500, "Image upload failed"));
      }

      if (result?.secure_url && result?.public_id) {
        section.image = result.secure_url;
        section.imagePublicId = result.public_id;
      }
    }

    if (order !== undefined) section.order = Number(order);
    if (isActive !== undefined) {
      section.isActive = isActive === true || isActive === "true";
    }

    await section.save();

    invalidateSectionCache();

    res
      .status(200)
      .json(createSuccess(200, "Home section updated successfully", section));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. DELETE SECTION (Admin)
// ==========================================
export const deleteSection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const section = await HomeSection.findById(id);

    if (!section) {
      return next(createError(404, "Home section not found"));
    }

    // Delete banner image from Cloudinary
    try {
      if (section.imagePublicId) {
        await deleteFromCloudinary(section.imagePublicId);
      }
    } catch (cloudErr) {
      console.warn("Failed to delete Cloudinary image:", cloudErr.message);
    }

    await HomeSection.findByIdAndDelete(id);

    invalidateSectionCache();

    res
      .status(200)
      .json(createSuccess(200, "Home section deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. REORDER SECTIONS (Admin)
// ==========================================
export const reorderSections = async (req, res, next) => {
  try {
    const { items } = req.body; // Array of { id, order }

    if (!Array.isArray(items) || items.length === 0) {
      return next(createError(400, "Items array is required"));
    }

    const operations = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { order: Number(item.order) } },
      },
    }));

    await HomeSection.bulkWrite(operations);

    invalidateSectionCache();

    res
      .status(200)
      .json(createSuccess(200, "Home sections reordered successfully"));
  } catch (error) {
    next(error);
  }
};