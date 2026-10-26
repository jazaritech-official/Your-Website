import mongoose from "mongoose";

/* ===========================================================
   STORE SETTINGS
   Singleton document (key: "store") holding store-wide
   admin-configurable settings. Currently holds the free
   shipping progress bar knobs; add more fields here as the
   store grows (each stays a single upserted doc).
   =========================================================== */
const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "store",
    },
    // Order subtotal at/above which shipping is free (Rs). The storefront
    // progress bar shows how much more the customer needs to spend.
    freeShippingThreshold: {
      type: Number,
      default: 2000,
      min: 0,
    },
    // Master switch for the free-shipping progress bar feature — when OFF
    // the component is never rendered, on any page, for any cart.
    freeShippingProgressBarEnabled: {
      type: Boolean,
      default: true,
    },
    // Base shipping fee (Rs) charged on orders that do NOT qualify for free
    // shipping — i.e. no per-product free-shipping flag AND the order
    // subtotal is below freeShippingThreshold. 0 keeps the store fully
    // free-shipping (the previous behavior).
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // City-wise shipping charges: admin-configurable per-city shipping fees.
    // When a city matches, its charge is used instead of the base shippingFee.
    // Normalized to lowercase for consistent lookups ("karachi" matches "Karachi").
    cityShipping: [
      {
        city: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
        },
        charge: {
          type: Number,
          required: true,
          min: 0,
        },
        enabled: {
          type: Boolean,
          default: true,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
      },
    ],
    // When true, cityShipping is used to determine shipping charges.
    // When false, the base shippingFee is always used (backward compatible).
    cityShippingEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

settingsSchema.index({ key: 1 }, { unique: true });

export const Settings = mongoose.model("Settings", settingsSchema);
