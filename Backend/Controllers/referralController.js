import mongoose from "mongoose";
import { Referral } from "../Models/Referral.js";
import { ReferralReward } from "../Models/ReferralReward.js";
import { ReferralWallet } from "../Models/ReferralWallet.js";
import { WalletTransaction } from "../Models/WalletTransaction.js";
import { ReferralSettings } from "../Models/ReferralSettings.js";
import Users from "../Models/Users.js";
import { createSuccess, createError } from "../utils/commonFunctions.js";
import {
  getReferralSettings,
  invalidateReferralSettingsCache,
  getLifetimeCompletedSpend,
  ensureReferralForUser,
  ensureWallet,
  applyRewardExpiry,
  validateReferralCodeLogic,
} from "../utils/referralService.js";

/* ==========================================
   1. GET REFERRAL OVERVIEW (logged-in user)
   ========================================== */
export const getReferralOverview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const settings = await getReferralSettings();

    const [referral, wallet, spend, recentTransactions, recentRewards] = await Promise.all([
      Referral.findOne({ userId }).lean(),
      ReferralWallet.findOne({ userId }).lean(),
      getLifetimeCompletedSpend(userId),
      WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(15).lean(),
      ReferralReward.find({ referredUserId: userId }).sort({ createdAt: -1 }).limit(15).lean(),
    ]);

    // Lazy reward expiry (fire-and-forget, never blocks the response)
    applyRewardExpiry(userId).catch((err) =>
      console.error("[Referral] Expiry failed:", err.message || err)
    );

    const spent = spend || 0;
    const progress = Math.min(100, Math.round((spent / Math.max(1, settings.minLifetimePurchase)) * 100));

    return res.status(200).json(
      createSuccess(200, "Referral overview fetched", {
        programEnabled: settings.programEnabled,
        settings: {
          minLifetimePurchase: settings.minLifetimePurchase,
          rewardPercentage: settings.rewardPercentage,
          maxReward: settings.maxReward,
          walletUsagePercent: settings.walletUsagePercent,
          firstPurchaseOnly: settings.firstPurchaseOnly,
          rewardExpiryMonths: settings.rewardExpiryMonths,
        },
        referral,
        wallet,
        lifetimeSpend: spent,
        remainingToUnlock: Math.max(0, settings.minLifetimePurchase - spent),
        progress,
        recentTransactions,
        recentRewards,
      })
    );
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   2. GET REFERRAL HISTORY (logged-in user)
   ========================================== */
export const getReferralHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [transactions, rewards, totalTxns, totalRewards] = await Promise.all([
      WalletTransaction.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ReferralReward.find({
        $or: [{ referredUserId: userId }, { referrerId: userId }],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments({ userId }),
      ReferralReward.countDocuments({ $or: [{ referredUserId: userId }, { referrerId: userId }] }),
    ]);

    return res.status(200).json(
      createSuccess(200, "Referral history fetched", {
        transactions,
        rewards,
        page,
        totalPages: Math.ceil(Math.max(totalTxns, totalRewards) / limit),
      })
    );
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   3. VALIDATE A REFERRAL CODE (checkout)
   ========================================== */
export const validateReferralCode = async (req, res, next) => {
  try {
    const { code, itemsPrice, shippingPhone } = req.body;
    const result = await validateReferralCodeLogic(code, req.user.id, shippingPhone || "");

    if (!result.valid) {
      return res.status(200).json({
        success: true,
        status: 200,
        message: result.reason,
        data: { valid: false, reason: result.reason },
      });
    }

    const settings = await getReferralSettings();
    let estimatedReward = 0;
    if (settings.programEnabled) {
      estimatedReward = Math.round(((Number(itemsPrice) || 0) * settings.rewardPercentage) / 100);
      if (settings.maxReward > 0 && estimatedReward > settings.maxReward) {
        estimatedReward = settings.maxReward;
      }
    }

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Referral code applied",
      data: {
        valid: true,
        code: result.referral.code,
        referrerName: result.referrerName,
        estimatedReward,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   4. GET REFERRAL SETTINGS (admin)
   ========================================== */
export const getReferralSettingsAdmin = async (req, res, next) => {
  try {
    const settings = await getReferralSettings(true);
    return res.status(200).json(createSuccess(200, "Referral settings fetched", settings));
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   5. UPDATE REFERRAL SETTINGS (admin)
   ========================================== */
export const updateReferralSettings = async (req, res, next) => {
  try {
    const {
      programEnabled,
      rewardPercentage,
      minLifetimePurchase,
      maxReward,
      walletUsagePercent,
      firstPurchaseOnly,
      rewardExpiryMonths,
    } = req.body;

    const updates = {};
    if (typeof programEnabled === "boolean") updates.programEnabled = programEnabled;
    if (rewardPercentage !== undefined) {
      const v = Number(rewardPercentage);
      if (Number.isFinite(v) && v >= 0 && v <= 100) updates.rewardPercentage = v;
      else return next(createError(400, "Reward % must be between 0 and 100"));
    }
    if (minLifetimePurchase !== undefined) {
      const v = Number(minLifetimePurchase);
      if (Number.isFinite(v) && v >= 0) updates.minLifetimePurchase = v;
      else return next(createError(400, "Minimum lifetime purchase must be 0 or more"));
    }
    if (maxReward !== undefined) {
      const v = Number(maxReward);
      if (Number.isFinite(v) && v >= 0) updates.maxReward = v;
      else return next(createError(400, "Maximum reward must be 0 or more"));
    }
    if (walletUsagePercent !== undefined) {
      const v = Number(walletUsagePercent);
      if (Number.isFinite(v) && v >= 0 && v <= 100) updates.walletUsagePercent = v;
      else return next(createError(400, "Wallet usage % must be between 0 and 100"));
    }
    if (typeof firstPurchaseOnly === "boolean") updates.firstPurchaseOnly = firstPurchaseOnly;
    if (rewardExpiryMonths !== undefined) {
      const v = Number(rewardExpiryMonths);
      if (Number.isFinite(v) && v >= 0) updates.rewardExpiryMonths = v;
      else return next(createError(400, "Expiry months must be 0 or more"));
    }

    const settings = await getReferralSettings();
    const saved = await ReferralWalletModelUpdate(updates, settings);
    invalidateReferralSettingsCache();
    return res.status(200).json(createSuccess(200, "Referral settings updated", saved));
  } catch (error) {
    next(error);
  }
};
// Persist the updated settings (upserting the singleton doc).
async function ReferralWalletModelUpdate(updates, current) {
  const doc = await ReferralSettings.findOneAndUpdate(
    { key: "referral" },
    { $set: updates },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return { ...current, ...doc, ...updates };
}

/* ==========================================
   6. ADMIN DASHBOARD STATS
   ========================================== */
export const getReferralAdminStats = async (req, res, next) => {
  try {
    const settings = await getReferralSettings(true);

    const [totalReferralUsers, walletsAgg, pendingAgg, creditedAgg, cancelledAgg, topReferrers, recentRewards, recentTransactions] =
      await Promise.all([
        Referral.countDocuments({}),
        ReferralWallet.aggregate([
          {
            $group: {
              _id: null,
              totalBalance: { $sum: "$balance" },
              totalLifetimeEarned: { $sum: "$lifetimeEarned" },
              totalLifetimeRedeemed: { $sum: "$lifetimeRedeemed" },
              totalPending: { $sum: "$pendingRewards" },
              totalSuccessful: { $sum: "$successfulReferrals" },
            },
          },
        ]),
        ReferralReward.aggregate([
          { $match: { status: "pending" } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ]),
        ReferralReward.aggregate([
          { $match: { status: "credited" } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ]),
        ReferralReward.aggregate([
          { $match: { status: "cancelled" } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ]),
        ReferralReward.aggregate([
          { $match: { status: { $in: ["approved", "credited"] } } },
          {
            $group: {
              _id: "$referrerId",
              rewards: { $sum: 1 },
              total: { $sum: "$amount" },
            },
          },
          { $sort: { total: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              referrerId: "$_id",
              username: { $ifNull: ["$user.username", "Deleted user"] },
              email: "$user.email",
              rewards: 1,
              total: 1,
            },
          },
        ]),
        ReferralReward.find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("referredUserId", "username")
          .lean(),
        WalletTransaction.find({})
          .sort({ createdAt: -1 })
          .limit(15)
          .populate("userId", "username email")
          .lean(),
      ]);

    const wallets = walletsAgg[0] || {};
    const pending = pendingAgg[0] || { count: 0, amount: 0 };
    const credited = creditedAgg[0] || { count: 0, amount: 0 };
    const cancelled = cancelledAgg[0] || { count: 0, amount: 0 };

    return res.status(200).json(
      createSuccess(200, "Referral admin stats fetched", {
        settings,
        totals: {
          referralUsers: totalReferralUsers,
          walletBalance: wallets.totalBalance || 0,
          lifetimeEarned: wallets.totalLifetimeEarned || 0,
          lifetimeRedeemed: wallets.totalLifetimeRedeemed || 0,
          pendingRewards: wallets.totalPending || 0,
          successfulReferrals: wallets.totalSuccessful || 0,
        },
        pending,
        credited,
        cancelled,
        topReferrers,
        recentRewards,
        recentTransactions,
      })
    );
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   8. SEARCH REFERRAL USERS (admin)
   q matches referral code OR username/email
   ========================================== */
export const searchReferralUsers = async (req, res, next) => {
  try {
    // Cap the query length so the regex is always cheap to build/run.
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (!q) {
      return res.status(200).json(createSuccess(200, "Referral search results", []));
    }
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const [byCode, byUser] = await Promise.all([
      Referral.find({ code: regex }).limit(20).lean(),
      Users.find({ $or: [{ username: regex }, { email: regex }] })
        .select("username email phoneNo profilePic")
        .limit(20)
        .lean(),
    ]);

    // Build a unique user map from both result sets.
    const userMap = new Map();
    byUser.forEach((u) => userMap.set(String(u._id), u));
    byCode.forEach((r) => {
      if (!userMap.has(String(r.userId))) {
        userMap.set(String(r.userId), { _id: r.userId });
      }
    });

    const userIds = [...userMap.keys()];
    const [wallets, referrals] = await Promise.all([
      ReferralWallet.find({ userId: { $in: userIds } }).lean(),
      Referral.find({ userId: { $in: userIds } }).lean(),
    ]);
    const walletByUser = new Map(wallets.map((w) => [String(w.userId), w]));
    const referralByUser = new Map(referrals.map((r) => [String(r.userId), r]));

    const results = [];
    for (const [uid, user] of userMap.entries()) {
      const ref = referralByUser.get(uid);
      results.push({
        userId: uid,
        username: user.username || "",
        email: user.email || "",
        phoneNo: user.phoneNo || "",
        profilePic: user.profilePic || null,
        code: ref?.code || null,
        referralStatus: ref?.status || null,
        timesUsed: ref?.timesUsed || 0,
        totalEarned: ref?.totalEarned || 0,
        wallet: walletByUser.get(uid) || null,
      });
    }

    return res.status(200).json(createSuccess(200, "Referral search results", results));
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   9. REFERRAL USER DETAIL (admin)
   Full picture: user, code, wallet, lifetime
   progress, transactions, and referral
   relationships (given + received).
   ========================================== */
export const getReferralUserDetail = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return next(createError(400, "Invalid user id"));
    }

    const settings = await getReferralSettings();
    const [user, referral, wallet, spend, transactions, rewardsGiven, rewardsReceived] =
      await Promise.all([
        Users.findById(userId)
          .select("username email phoneNo profilePic role createdAt")
          .lean(),
        Referral.findOne({ userId }).lean(),
        ReferralWallet.findOne({ userId }).lean(),
        getLifetimeCompletedSpend(userId),
        WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(40).lean(),
        ReferralReward.find({ referrerId: userId })
          .sort({ createdAt: -1 })
          .limit(40)
          .lean(),
        ReferralReward.find({ referredUserId: userId })
          .sort({ createdAt: -1 })
          .limit(40)
          .lean(),
      ]);

    if (!user && !referral && !wallet && transactions.length === 0) {
      return next(createError(404, "User not found"));
    }

    const spent = spend || 0;
    return res.status(200).json(
      createSuccess(200, "Referral user detail fetched", {
        user,
        referral,
        wallet,
        lifetimeSpend: spent,
        remainingToUnlock: Math.max(0, settings.minLifetimePurchase - spent),
        progress: Math.min(
          100,
          Math.round((spent / Math.max(1, settings.minLifetimePurchase)) * 100)
        ),
        settings: {
          rewardPercentage: settings.rewardPercentage,
          minLifetimePurchase: settings.minLifetimePurchase,
        },
        transactions,
        rewardsGiven,
        rewardsReceived,
      })
    );
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   7. MANUAL RE-CHECK ELIGIBILITY (user)
   Helps users whose threshold was crossed while the program was off.
   ========================================== */
export const claimReferralCode = async (req, res, next) => {
  try {
    const result = await ensureReferralForUser(req.user.id);
    if (result.unlocked) {
      return res.status(200).json(
        createSuccess(200, "Referral code unlocked", {
          unlocked: true,
          code: result.referral.code,
        })
      );
    }
    if (result.referral) {
      return res.status(200).json(
        createSuccess(200, "Referral code", {
          unlocked: false,
          code: result.referral.code,
        })
      );
    }
    await ensureWallet(req.user.id);
    return res.status(200).json(
      createSuccess(200, "Referral code not yet unlocked", {
        unlocked: false,
        code: null,
        spend: result.spend || 0,
      })
    );
  } catch (error) {
    next(error);
  }
};
