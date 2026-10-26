import mongoose from "mongoose";

/* ===========================================================
   REFERRAL
   One document per eligible user holding their ONE permanent
   referral code. Codes are unique, never regenerated, and can
   never belong to more than one user (unique index enforces).
   =========================================================== */
const referralSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    // Number of successfully credited referrals + total earned (read model)
    timesUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

referralSchema.index({ userId: 1 }, { unique: true });
referralSchema.index({ code: 1 }, { unique: true });

export const Referral = mongoose.model("Referral", referralSchema);
