import mongoose from "mongoose";

/* ===========================================================
   WALLET TRANSACTION (immutable ledger)
   Every credit/debit is recorded here with the resulting
   balanceAfter so the wallet can always be audited and rebuilt.
   =========================================================== */
const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    source: {
      type: String,
      enum: ["referral_reward", "wallet_redeem", "wallet_refund", "reward_expiry", "reward_clawback", "adjustment"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      default: 0,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    rewardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReferralReward",
      default: null,
    },
    note: {
      type: String,
      default: "",
    },
    // For expiry rules: when this credit lapses (lazy expiry)
    expiresAt: {
      type: Date,
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    // For clawbacks: when a credited reward was reversed (audit trail)
    clawedBackAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ orderId: 1, source: 1 });

/*
Hard double-credit guarantee: at most ONE wallet transaction per reward.
Whichever process successfully inserts the referral_reward credit owns that
reward's payout — a concurrent duplicate insert fails with a unique-key error
and is ignored, so a referral reward can NEVER be credited twice even when
multiple backend instances dispatch the Delivered hook at the same time.
*/
walletTransactionSchema.index(
  { rewardId: 1, source: 1 },
  {
    unique: true,
    partialFilterExpression: { rewardId: { $type: "objectId" } },
    // Explicit name matches scripts/hardenReferralLedger.js so mongoose
    // autoIndex and the migration create an identical spec — idempotent in
    // any order, never an IndexOptionsConflict.
    name: "rewardId_1_source_1_unique",
  }
);

export const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
