import mongoose from "mongoose";

/* ===========================================================
   REFERRAL REWARD
   One reward per referred order. Lifecycle:
   pending → (order delivered) → credited (wallet paid)
   pending → (order cancelled) → cancelled
   credited → (order reversed/refunded after delivery) → clawed_back

   The unique index on orderId guarantees an order can never
   produce more than one reward (anti double-credit / abuse).
   The credited → clawed_back transition is atomic and guarded,
   so a reward is never clawed back twice.
   =========================================================== */
const referralRewardSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
    },
    orderTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    percentage: {
      type: Number,
      default: 5,
    },
    cap: {
      type: Number,
      default: 0, // 0 = no cap
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "credited", "cancelled", "clawed_back"],
      default: "pending",
      index: true,
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    clawedBackAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

referralRewardSchema.index({ orderId: 1 }, { unique: true });
referralRewardSchema.index({ referrerId: 1, status: 1, createdAt: -1 });
referralRewardSchema.index({ referredUserId: 1, status: 1 });

export const ReferralReward = mongoose.model("ReferralReward", referralRewardSchema);
