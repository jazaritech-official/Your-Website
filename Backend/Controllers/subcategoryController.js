import { Subcategory } from "../Models/Subcategory.js";
import { Category } from "../Models/Category.js";
import { Product } from "../Models/Product.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  derivePublicIdFromUrl,
} from "../utils/cloudinary.js";
import { createError, createSuccess, createSlug } from "../utils/commonFunctions.js";
import { invalidateCategoriesCache } from "../utils/redisCache.js";

// Folder used for all subcategory images on Cloudinary.
const SUBCATEGORY_IMAGE_FOLDER = "irhasinn/Subcategory";

// Resolve the Cloudinary public_id of a subcategory's image for cleanup:
// prefer the stored imagePublicId; for legacy records that only have the
// image URL, derive it conservatively from the URL (returns null when the
// URL does not match the exact Cloudinary upload shape — never guessed).
const getSubcategoryImagePublicId = (subcategory) => {
  if (subcategory.imagePublicId) return subcategory.imagePublicId;
  if (subcategory.image) {
    return derivePublicIdFromUrl(subcategory.image, SUBCATEGORY_IMAGE_FOLDER);
  }
  return null;
};

const parseIsActive = (value) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
};

// ==========================================
// 1. CREATE SUBCATEGORY
// ==========================================
export const createSubcategory = async (req, res, next) => {
  try {
    const { name, parentCategory, description } = req.body;

    if (!name?.trim() || !parentCategory || !req.file) {
      return next(
        createError(
          400,
          "All fields (name, parent category, and image) are required",
        ),
      );
    }

    const file = req.file;
    let result;
    try {
      result = await uploadToCloudinary(file.buffer, SUBCATEGORY_IMAGE_FOLDER);
    } catch (error) {
      return next(createError(500, "Image upload failed"));
    }

    if (!result?.url || !result?.public_id) {
      return next(
        createError(
          400,
          "All fields (name, parent category, and image) are required",
        ),
      );
    }

    // Parent category must exist
    const category = await Category.findById(parentCategory);
    if (!category) {
      return next(createError(404, "Parent category not found"));
    }

    // Duplicate subcategory name within the same parent category
    const existing = await Subcategory.findOne({
      name: name.trim(),
      parentCategory: category._id,
    });
    if (existing) {
      return next(
        createError(400, "Subcategory already exists in this category"),
      );
    }

    if (!req.user || !req.user.id) {
      return next(
        createError(401, "You are not authenticated! Missing user info."),
      );
    }

    const isActive = parseIsActive(req.body.isActive);

    const subcategory = new Subcategory({
      name: name.trim(),
      description: description?.trim() || "",
      slug: createSlug(name),
      parentCategory: category._id,
      image: result.secure_url,
      imagePublicId: result.public_id,
      isActive: isActive === undefined ? true : isActive,
      user: req.user.id,
    });

    await subcategory.save();

    // Link it to the parent category's subcategories array
    await Category.findByIdAndUpdate(
      category._id,
      { $push: { subcategories: subcategory._id } },
      { new: true },
    );

    // The subcategories array is part of the cached getAllCategories payload.
    await invalidateCategoriesCache();

    const populated = await Subcategory.findById(subcategory._id).populate(
      "parentCategory",
      "name slug",
    );

    res
      .status(201)
      .json(
        createSuccess(201, "Subcategory created successfully", populated),
      );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. GET ALL SUBCATEGORIES
// ==========================================
export const getSubcategories = async (req, res, next) => {
  try {
    const subcategories = await Subcategory.find()
      .populate("parentCategory", "name slug")
      .populate("user", "username email")
      .sort({ createdAt: 1 });

    // Attach a lightweight product count per subcategory so admin UIs can
    // show "X products" without a query per row.
    const ids = subcategories.map((s) => s._id);
    const counts = ids.length
      ? await Product.aggregate([
          { $match: { subcategory: { $in: ids } } },
          { $group: { _id: "$subcategory", count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    const payload = subcategories.map((s) => ({
      ...s.toObject(),
      productCount: countMap.get(String(s._id)) || 0,
    }));

    res
      .status(200)
      .json(
        createSuccess(200, "Subcategories fetched successfully", payload),
      );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. GET SUBCATEGORIES BY PARENT CATEGORY
// ==========================================
export const getSubcategoriesByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return next(createError(404, "Category not found"));
    }

    const subcategories = await Subcategory.find({
      parentCategory: category._id,
    })
      .populate("parentCategory", "name slug")
      .sort({ createdAt: 1 });

    res
      .status(200)
      .json(
        createSuccess(
          200,
          "Subcategories fetched successfully",
          subcategories,
        ),
      );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. GET SINGLE SUBCATEGORY (BY ID)
// ==========================================
export const getSubcategoryById = async (req, res, next) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id)
      .populate("parentCategory", "name slug")
      .populate("user", "username email");

    if (!subcategory) {
      return next(createError(404, "Subcategory not found"));
    }

    res
      .status(200)
      .json(createSuccess(200, "Subcategory found", subcategory));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. UPDATE SUBCATEGORY
// ==========================================
export const updateSubcategory = async (req, res, next) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return next(createError(404, "Subcategory not found"));
    }

    const { name, description, parentCategory, isActive } = req.body;

    if (name?.trim()) {
      const trimmedName = name.trim();
      // Duplicate check scoped to the (possibly new) parent category.
      const effectiveParent = parentCategory
        ? String(parentCategory)
        : String(subcategory.parentCategory);
      const dup = await Subcategory.findOne({
        name: trimmedName,
        parentCategory: effectiveParent,
        _id: { $ne: subcategory._id },
      });
      if (dup) {
        return next(
          createError(400, "Subcategory already exists in this category"),
        );
      }
      subcategory.name = trimmedName;
      subcategory.slug = createSlug(trimmedName);
    }

    if (description !== undefined) {
      subcategory.description = description?.trim() || "";
    }

    if (parentCategory) {
      const category = await Category.findById(parentCategory);
      if (!category) {
        return next(createError(404, "Parent category not found"));
      }
      if (String(category._id) !== String(subcategory.parentCategory)) {
        // Move the subcategory: unlink from the old category, link to the new.
        await Category.findByIdAndUpdate(subcategory.parentCategory, {
          $pull: { subcategories: subcategory._id },
        });
        subcategory.parentCategory = category._id;
        await Category.findByIdAndUpdate(category._id, {
          $push: { subcategories: subcategory._id },
        });
      }
    }

    const parsedIsActive = parseIsActive(isActive);
    if (parsedIsActive !== undefined) {
      subcategory.isActive = parsedIsActive;
    }

    if (req.file) {
      // Capture the OLD asset BEFORE replacing it so the replaced image can be
      // cleaned up safely (never the new one).
      const oldPublicId = getSubcategoryImagePublicId(subcategory);
      let result;
      try {
        result = await uploadToCloudinary(
          req.file.buffer,
          SUBCATEGORY_IMAGE_FOLDER,
        );
      } catch (error) {
        return next(createError(500, "Image upload failed"));
      }
      // Only swap the stored fields (and clean up the replaced asset) when the
      // new upload returned BOTH a URL and a public_id — otherwise keep the old
      // image untouched rather than orphaning it.
      if (result?.secure_url && result?.public_id) {
        subcategory.image = result.secure_url;
        subcategory.imagePublicId = result.public_id;
        if (oldPublicId && oldPublicId !== result.public_id) {
          try {
            await deleteFromCloudinary(oldPublicId);
          } catch (deleteError) {
            console.warn(
              "Failed to delete replaced subcategory image from Cloudinary:",
              deleteError.message || deleteError,
            );
          }
        }
      }
    }

    await subcategory.save();

    // Name/parent/image/status changes alter the cached category payload.
    await invalidateCategoriesCache();

    const populated = await Subcategory.findById(subcategory._id).populate(
      "parentCategory",
      "name slug",
    );

    res
      .status(200)
      .json(
        createSuccess(200, "Subcategory updated successfully", populated),
      );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. DELETE SUBCATEGORY
// ==========================================
export const deleteSubcategory = async (req, res, next) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);

    if (!subcategory) {
      return next(createError(404, "Subcategory not found"));
    }

    // Safest behavior (mirrors category deletion): never silently orphan
    // products that reference this subcategory — block instead.
    const productsCount = await Product.countDocuments({
      subcategory: subcategory._id,
    });

    if (productsCount > 0) {
      return next(
        createError(
          400,
          "Cannot delete subcategory with products. Remove products first.",
        ),
      );
    }

    // Clean up the Cloudinary image (best-effort).
    const imagePublicId = getSubcategoryImagePublicId(subcategory);
    if (imagePublicId) {
      try {
        await deleteFromCloudinary(imagePublicId);
      } catch (deleteError) {
        console.warn(
          "Failed to delete subcategory image from Cloudinary:",
          deleteError.message || deleteError,
        );
      }
    }

    // Unlink from the parent category, then delete.
    await Category.findByIdAndUpdate(subcategory.parentCategory, {
      $pull: { subcategories: subcategory._id },
    });
    await Subcategory.findByIdAndDelete(req.params.id);

    await invalidateCategoriesCache();

    res
      .status(200)
      .json(createSuccess(200, "Subcategory deleted successfully"));
  } catch (error) {
    next(error);
  }
};
