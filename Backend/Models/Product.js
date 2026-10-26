import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
    },
    brand: {
      type: String,
      required: [true, "Product brand is required"],
      trim: true,
    },
    price: {
      type: Number,
      // Controller-level conditional validation ensures non-size-based categories
      // still require a valid price. For size-based categories, global price is
      // optional (size-level variantPricing is the source of truth).
      default: 0,
      min: 0,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    // Optional subcategory (backward compatible — legacy products created
    // before the hierarchy feature have no subcategory and keep working).
    // When present it must belong to the product's `category` (validated in
    // the product controller, never only on the frontend).
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      default: null,
      index: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    sold: {
      type: Number,
      default: 0,
    },
    colors: {
      type: [String],
      default: [],
    },
    sizes: {
      type: [String],
      default: [],
    },
    // Variant-wise pricing: keyed by "ColorName__SizeValue" (e.g. "Black__14")
    // or just "SizeValue" for products without colors. Only populated when
    // variant-level prices differ from the base `price`. Backward compatible:
    // old products without this field simply use `price` for all variants.
    variantPricing: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Variant-wise stock: keyed the same way as variantPricing.
    // For size-based products, stock becomes per-size instead of global.
    variantStock: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
        // SEO alt text — optional, editable by the admin; old products simply
        // lack it (fallback = product-name based).
        alt: { type: String, default: "" },
      },
    ],
    ratings: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        star: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: {
          type: String,
          required: false,
        },
        reviewDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    shippingCharge: {
      type: Number,
      default: 0,
    },
    freeShipping: {
      type: Boolean,
      default: false,
    },
    customizable: {
      type: Boolean,
      default: false,
    },
    // When true (default), customers see a live AI-rendered preview of their
    // customization. When false, customers provide input but no preview is shown.
    showCustomizationPreview: {
      type: Boolean,
      default: true,
    },
    /*
      AI-detected print layout (generated ONCE by the admin for each product
      image via Gemini Vision — never at customer runtime). Used by the live
      preview to render the customer's text exactly where the sample text is
      printed on the product photo. Shape:
      {
        customizable: boolean,
        printableArea: { x, y, width, height },  // normalized 0..1 safe area
        textLayer: { x, y, width, height, rotation, fontFamily, fontSize,
                     fontWeight, color, stroke, strokeColor, shadow,
                     align, lineSpacing },        // x/y = box CENTER, normalized
        sampleText: string
      }
    */
    printLayout: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    /*
      Persistent AI detection status — lets the Admin Products list show
      ✓ Detected / ⚠ Not Detected / ✕ Failed WITHOUT opening the editor.
      not_detected = never analyzed · detected = a layout is stored ·
      failed = last analysis errored (the last good layout, if any, is kept
      so customer previews never break).
    */
    printLayoutStatus: {
      type: String,
      enum: ["not_detected", "detected", "failed"],
      default: "not_detected",
    },
    printLayoutError: {
      type: String,
      default: null,
    },
    customizationFields: [
      {
        fieldType: {
          type: String,
          enum: ["text", "textarea", "image"],
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        required: {
          type: Boolean,
          default: false,
        },
      },
    ],
    // Tracks async image upload status after product creation/update.
    // "complete" = images are attached (or no new images to upload)
    // "pending"  = images are queued for background upload
    // "processing" = uploads are actively in progress
    // "failed"  = background upload failed (admin can retry)
    imageProcessingStatus: {
      type: String,
      enum: ["complete", "pending", "processing", "failed"],
      default: "complete",
    },
    // Error message from the last failed background upload attempt.
    imageProcessingError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

productSchema.index({ name: "text", description: "text", tags: "text" });

// Compound index for the bulk-upload duplicate lookup
// Product.findOne({ name: <regex i>, category: <ObjectId> }) — additive,
// no behavior change (BUG-10).
productSchema.index({ category: 1, name: 1 });

/* Tier 3: indexes for the public listing sorts (price / rating / popular) and
   the default createdAt sort — additive, no behavior change. A single-field
   index serves both directions, so one index per field is enough. */
productSchema.index({ createdAt: -1 });
productSchema.index({ price: 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ sold: -1 });

export const Product = mongoose.model("Product", productSchema);
