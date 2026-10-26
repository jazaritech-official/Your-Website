import mongoose from "mongoose";

/* ===========================================================
   REFERRAL SETTINGS
   Singleton document (key: "referral") holding every
   admin-configurable knob of the referral rewards program.
   =========================================================== */
const referralSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "referral",
    },
    // Master switch — when off, validation/crediting is skipped everywhere
    programEnabled: {
      type: Boolean,
      default: true,
    },
    // Reward % of the referred order subtotal credited to the referrer
    rewardPercentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    // Lifetime completed (Delivered) spend required to unlock a code
    minLifetimePurchase: {
      type: Number,
      default: 9999,
      min: 0,
    },
    // Cap on a single reward (0 = unlimited)
    maxReward: {
      type: Number,
      default: 1000,
      min: 0,
    },
    // Max % of the order subtotal that can be paid from the wallet
    walletUsagePercent: {
      type: Number,
      default: 20,
      min: 0,
      max: 100,
    },
    // If true, a referral code is only accepted on the customer's first order
    firstPurchaseOnly: {
      type: Boolean,
      default: true,
    },
    // Lazy expiry of wallet credits in months (0 = never expires)
    rewardExpiryMonths: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

referralSettingsSchema.index({ key: 1 }, { unique: true });

export const ReferralSettings = mongoose.model("ReferralSettings", referralSettingsSchema);
