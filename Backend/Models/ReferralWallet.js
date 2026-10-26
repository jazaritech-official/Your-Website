import mongoose from "mongoose";

/* ===========================================================
   REFERRAL WALLET
   Per-user wallet summary. The ledger of every movement lives
   in WalletTransaction — this document is a denormalized read
   model kept in sync through atomic $inc updates.
   =========================================================== */
const referralWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    lifetimeEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    lifetimeRedeemed: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingRewards: {
      type: Number,
      default: 0,
      min: 0,
    },
    successfulReferrals: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

referralWalletSchema.index({ userId: 1 }, { unique: true });

export const ReferralWallet = mongoose.model("ReferralWallet", referralWalletSchema);
