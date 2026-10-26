import mongoose from "mongoose";

// Admin-built homepage section: a full-width banner image followed by the
// product grid of its linked category (optionally narrowed to one
// subcategory). `order` sequences sections on the homepage and `isActive`
// toggles visibility without deleting the section.
const homeSectionSchema = new mongoose.Schema(
  {
    // Cloudinary URL of the full-width banner image (required).
    image: {
      type: String,
      required: true,
    },
    // Cloudinary public_id of the banner image — enables safe deletion of
    // the asset when the image is replaced or the section is deleted.
    imagePublicId: {
      type: String,
      required: true,
    },
    // The category whose products are shown below this section's banner.
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    // Optional narrowing: when set, only products in this subcategory of
    // `category` are shown. When null, all products of `category` are shown.
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      default: null,
      index: true,
    },
    // Sequencing on the homepage (ascending).
    order: {
      type: Number,
      default: 0,
    },
    // Visibility toggle — inactive sections are hidden from the homepage
    // but kept for the admin.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const HomeSection = mongoose.model("HomeSection", homeSectionSchema);