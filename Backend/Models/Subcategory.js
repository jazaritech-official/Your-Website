import mongoose from "mongoose";

const subcategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    // A subcategory always belongs to EXACTLY one parent category.
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    // Cloudinary public_id of the subcategory image — enables safe deletion
    // of the asset when the image is replaced or the subcategory is deleted.
    // Optional for backward compatibility; legacy records only store the URL
    // (see derivePublicIdFromUrl in utils/cloudinary.js).
    imagePublicId: {
      type: String,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// A subcategory name must be unique WITHIN its parent category — the same
// name (e.g. "Shirts") may exist under different categories.
subcategorySchema.index({ parentCategory: 1, name: 1 }, { unique: true });
subcategorySchema.index({ slug: 1 });

export const Subcategory = mongoose.model("Subcategory", subcategorySchema);
