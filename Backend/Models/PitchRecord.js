import mongoose from "mongoose";
import { INDUSTRY_PRESET_IDS } from "../utils/showcaseConfig.js";

/* ===========================================================
   CLIENT PITCH & SHOWCASE RECORD
   -----------------------------------------------------------
   Internal sales record in the Jazari Tech Official control
   plane: which demo showcase was prepared for which client,
   which interfaces were configured, which features were
   demonstrated, and what happened during the pitch.

   CRITICAL DISTINCTION
   This describes CONFIGURATION HISTORY of a showcase profile
   (homepage hero, theme, category presentation, …), NOT a claim
   that source files were rewritten per client.

   PRIVACY
   `internalNotes` / `outcomeNotes` are returned ONLY on the
   authenticated admin endpoints — never on any public API.

   ARCHIVAL SAFETY
   The record keeps slug/name/preset SNAPSHOT fields, so it
   stays understandable even after its showcase profile is
   archived or renamed.
   =========================================================== */

/** Internal sales workflow — deliberately distinct from order statuses. */
export const PITCH_STATUSES = [
  "draft",
  "preparing",
  "ready",
  "presented",
  "followup",
  "won",
  "lost",
  "archived",
];

/** Interfaces an operator can record as customized for a pitch. */
export const PITCH_INTERFACES = [
  "homepage",
  "header-logo",
  "theme-colors",
  "typography",
  "hero",
  "category-presentation",
  "featured-products",
  "product-detail",
  "footer",
  "contact-info",
  "social-links",
  "seo-metadata",
];

/** Features that can be recorded as demonstrated. */
export const PITCH_FEATURES = [
  "industry-presets",
  "ai-brand-suggestions",
  "theme-editor",
  "logo-upload",
  "hero-config",
  "section-ordering",
  "product-ordering",
  "storefront-preview",
  "purchase-flow",
  "order-tracking",
  "rider-delivery",
  "referral-wallet",
];

const pitchRecordSchema = new mongoose.Schema(
  {
    clientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    pitchTitle: { type: String, default: "", trim: true, maxlength: 140 },
    industry: {
      type: String,
      enum: INDUSTRY_PRESET_IDS,
      default: "general",
    },
    status: {
      type: String,
      enum: PITCH_STATUSES,
      default: "draft",
      index: true,
    },
    // Optional link to the showcase profile. Optional (null) because a
    // record may outlive its profile — snapshots below preserve context.
    showcaseProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BrandProfile",
      default: null,
      index: true,
    },
    profileSlug: { type: String, default: "", maxlength: 80 },
    profileNameSnapshot: { type: String, default: "", maxlength: 100 },
    selectedPreset: { type: String, default: "", maxlength: 40 },
    configVersion: { type: Number, default: null },
    // Interfaces customized for this pitch (whitelisted strings).
    configuredInterfaces: {
      type: [String],
      enum: PITCH_INTERFACES,
      default: [],
    },
    demonstratedFeatures: {
      type: [String],
      enum: PITCH_FEATURES,
      default: [],
    },
    customizationSummary: { type: String, default: "", maxlength: 2000 },
    // PRIVATE — never exposed outside authenticated admin endpoints.
    internalNotes: { type: String, default: "", maxlength: 4000 },
    outcomeNotes: { type: String, default: "", maxlength: 2000 },
    presentedAt: { type: Date, default: null },
    followUpAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

pitchRecordSchema.index({ status: 1, createdAt: -1 });
pitchRecordSchema.index({ clientName: 1 });

export const PitchRecord =
  mongoose.models.PitchRecord || mongoose.model("PitchRecord", pitchRecordSchema);
