import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    image: {
      type: String,
      required: true,
    },
    // Cloudinary public_id of the category image — enables safe deletion of
    // the asset when the image is replaced or the category is deleted.
    // Optional for backward compatibility: legacy categories only store the
    // image URL; for those, the public_id is derived conservatively from the
    // URL (see derivePublicIdFromUrl) when the URL matches the
    // exact Cloudinary upload shape — never guessed.
    imagePublicId: {
      type: String,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    // Direct children of this category (hierarchy). Maintained by the
    // subcategory controller on create/update/delete.
    subcategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subcategory",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
    // When enabled, products in this category require Admin to set Price and
    // Stock per size instead of one global Price/Stock. The Admin Product form
    // reads this flag to decide whether to disable the global Price/Stock inputs.
    usesSizeBasedPricing: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Fast lookup by slug (getCategoryBySlug) — same pattern as Product.slug
// and Subcategory.slug.
categorySchema.index({ slug: 1 });

export const Category = mongoose.model("Category", categorySchema);
