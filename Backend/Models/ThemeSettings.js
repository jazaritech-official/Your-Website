import mongoose from "mongoose";
import {
  THEME_TOKEN_REGISTRY,
  DEFAULT_BRANDING,
} from "../utils/themeDefaults.js";

/*
 * The `colors` nested path is BUILT FROM the token registry rather than
 * hand-written. Mongoose runs with `strict: true`, which silently DROPS any
 * path not declared in the schema — so a hand-maintained field list would make
 * every newly-registered token silently refuse to persist (an admin could pick
 * a colour, get a success response, and have it vanish on the next read).
 * Deriving it here means the registry is the only file to touch when adding a
 * token, and the two can never drift.
 */
const colorFields = THEME_TOKEN_REGISTRY.reduce((acc, token) => {
  acc[token.apiKey] = { type: String, default: token.default };
  return acc;
}, {});

/* ===========================================================
   THEME SETTINGS
   Singleton document (key: "theme") holding the storefront's
   admin-configurable BRANDING: the curated brand colour tokens,
   the logo and the site name / tagline.

   Mirrors the existing `Settings` singleton pattern exactly
   (Models/Settings.js) — one upserted doc, `$setOnInsert`
   defaults, read through a cache-aside layer and invalidated on
   write. It is a SEPARATE document from `Settings` on purpose so:
     • the shipping-settings public shape / cache key is untouched
       (zero risk to the existing cart + checkout consumers), and
     • theme reads (which every page load performs) never drag the
       shipping payload along, or vice versa.

   Every colour field defaults to the value already compiled into
   the frontend's Tailwind `@theme` block, so a store that never
   opens the customizer renders pixel-identically to before.
   =========================================================== */
const themeSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "theme",
    },
    // Curated set — see Backend/utils/themeDefaults.js for the registry,
    // labels and the usage-count justification.
    colors: colorFields,
    // Cloudinary secure_url + public_id of the admin-uploaded logo.
    // Empty strings mean "no custom logo" → the frontend falls back to
    // the built-in /Irha Studio-12.jpg asset.
    logoUrl: {
      type: String,
      default: DEFAULT_BRANDING.logoUrl,
    },
    logoPublicId: {
      type: String,
      default: DEFAULT_BRANDING.logoPublicId,
    },
    siteName: {
      type: String,
      default: DEFAULT_BRANDING.siteName,
      trim: true,
      maxlength: 60,
    },
    tagline: {
      type: String,
      default: DEFAULT_BRANDING.tagline,
      trim: true,
      maxlength: 120,
    },
  },
  { timestamps: true }
);

themeSettingsSchema.index({ key: 1 }, { unique: true });

export const ThemeSettings = mongoose.model("ThemeSettings", themeSettingsSchema);
