import { Referral } from "../Models/Referral.js";
import { ReferralReward } from "../Models/ReferralReward.js";
import { ReferralWallet } from "../Models/ReferralWallet.js";
import { WalletTransaction } from "../Models/WalletTransaction.js";
import { ReferralSettings } from "../Models/ReferralSettings.js";
import { Order } from "../Models/Orders.js";
import Users from "../Models/Users.js";
import { Notification } from "../Models/Notification.js";

/* ===========================================================
   REFERRAL REWARDS — SHARED CORE LOGIC
   -----------------------------------------------------------
   Single source of truth used by BOTH the REST controllers and
   the order lifecycle hooks so validation, code generation,
   reward crediting and wallet math are never duplicated.
   =========================================================== */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export const DEFAULT_SETTINGS = {
  programEnabled: true,
  rewardPercentage: 5,
  minLifetimePurchase: 9999,
  maxReward: 1000,
  walletUsagePercent: 20,
  firstPurchaseOnly: true,
  rewardExpiryMonths: 0,
};

let settingsCache = null;
let settingsCacheAt = 0;
const SETTINGS_TTL_MS = 30 * 1000;

/** Read admin settings (30s cached, upserted singleton document). */
export async function getReferralSettings(force = false) {
  if (!force && settingsCache && Date.now() - settingsCacheAt < SETTINGS_TTL_MS) {
    return settingsCache;
  }
  try {
    const doc = await ReferralSettings.findOneAndUpdate(
      { key: "referral" },
      { $setOnInsert: { key: "referral" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    settingsCache = { ...DEFAULT_SETTINGS, ...doc };
    settingsCacheAt = Date.now();
    return settingsCache;
  } catch (err) {
    console.error("[Referral] Settings read failed:", err.message || err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Invalidate the cached settings after an admin update. */
export function invalidateReferralSettingsCache() {
  settingsCache = null;
  settingsCacheAt = 0;
}

/* -----------------------------------------------------------
   ELIGIBILITY + CODE GENERATION
   ----------------------------------------------------------- */

/** Lifetime spend from DELIVERED orders only. */
export async function getLifetimeCompletedSpend(userId) {
  const [agg] = await Order.aggregate([
    { $match: { user: userId, status: "Delivered" } },
    { $group: { _id: null, total: { $sum: "$totalPrice" } } },
  ]);
  return agg && agg.total ? agg.total : 0;
}

const randomCode = () =>
  Array.from({ length: 5 }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join("");

/**
 * Generate a unique referral code. Format: IRHAS-XXXXX (easy to read,
 * unambiguous alphabet, collides retried).
 */
async function generateUniqueCode() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `IRHAS-${randomCode()}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await Referral.exists({ code }))) return code;
  }
  return null;
}

/** Ensure a wallet document exists for a user. */
export async function ensureWallet(userId) {
  let wallet = await ReferralWallet.findOne({ userId });
  if (!wallet) wallet = await ReferralWallet.create({ userId });
  return wallet;
}

/**
 * Unlock a referral code for the user IF their lifetime completed spend
 * meets the threshold. Idempotent — existing code is returned untouched.
 * Returns { unlocked, referral, spend }.
 */
export async function ensureReferralForUser(userId) {
  const existing = await Referral.findOne({ userId });
  if (existing) return { unlocked: false, referral: existing, spend: null };

  const settings = await getReferralSettings();
  if (!settings.programEnabled) return { unlocked: false, referral: null, spend: null };

  const spend = await getLifetimeCompletedSpend(userId);
  if (spend < settings.minLifetimePurchase) {
    return { unlocked: false, referral: null, spend };
  }

  const code = await generateUniqueCode();
  if (!code) return { unlocked: false, referral: null, spend };

  const referral = await Referral.create({ userId, code });
  await ensureWallet(userId);
  await notifyUser(userId, {
    title: "🎉 Referral Rewards Unlocked!",
    message: `You unlocked your exclusive referral code ${code}. Share it with friends and earn rewards on every successful order.`,
    link: "/profile/referral",
  });
  return { unlocked: true, referral, spend };
}

/* -----------------------------------------------------------
   WALLET OPERATIONS (atomic, guarded)
   ----------------------------------------------------------- */

/** Credit a wallet; returns the updated wallet. */
export async function creditWallet(userId, { amount, source, orderId = null, rewardId = null, note = "" }) {
  if (!amount || amount <= 0) return null;
  const settings = await getReferralSettings();
  const expiresAt =
    settings.rewardExpiryMonths > 0 && (source === "referral_reward" || source === "wallet_refund")
      ? new Date(Date.now() + settings.rewardExpiryMonths * 30 * 24 * 60 * 60 * 1000)
      : null;
  const wallet = await ReferralWallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount, lifetimeEarned: amount } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await WalletTransaction.create({
    userId,
    type: "credit",
    source,
    amount,
    balanceAfter: wallet.balance,
    orderId,
    rewardId,
    note,
    expiresAt,
  });
  return wallet;
}

/** Atomically debit a wallet; returns null when the balance is insufficient. */
export async function debitWallet(userId, amount, { source, orderId = null, note = "" }) {
  if (!amount || amount <= 0) return null;
  const wallet = await ReferralWallet.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    { $inc: { balance: -amount, lifetimeRedeemed: amount } },
    { new: true }
  );
  if (!wallet) return null;
  const txn = await WalletTransaction.create({
    userId,
    type: "debit",
    source,
    amount,
    balanceAfter: wallet.balance,
    orderId,
    note,
  });
  return { wallet, transaction: txn };
}

/* -----------------------------------------------------------
   CHECKOUT: REFERRAL CODE VALIDATION
   ----------------------------------------------------------- */

/**
 * Validate a referral code at checkout time. Rules:
 *  - program enabled, code exists + active
 *  - cannot use your own code
 *  - only one (non-cancelled) referral code per customer, ever
 *  - optional first-purchase-only rule
 *  - soft anti multi-account guard: shipping phone may not match referrer phone
 */
export async function validateReferralCodeLogic(code, userId, shippingPhone = "") {
  if (!code || !code.trim()) return { valid: false, reason: "No referral code provided" };
  const settings = await getReferralSettings();
  if (!settings.programEnabled) {
    return { valid: false, reason: "The referral rewards program is currently paused." };
  }

  const normalized = String(code).trim().toUpperCase();
  const referral = await Referral.findOne({ code: normalized, status: "active" });
  if (!referral) return { valid: false, reason: "Invalid referral code" };
  if (referral.userId.toString() === String(userId)) {
    return { valid: false, reason: "You cannot use your own referral code" };
  }

  const usedBefore = await ReferralReward.findOne({
    referredUserId: userId,
    status: { $ne: "cancelled" },
  });
  if (usedBefore) {
    return { valid: false, reason: "You have already used a referral code on an earlier order" };
  }

  if (settings.firstPurchaseOnly) {
    // Only genuine (non-cancelled) purchase attempts count — a cancelled
    // first order must NEVER permanently block referral usage.
    const prevOrders = await Order.countDocuments({
      user: userId,
      status: { $nin: ["Cancelled", "Refunded"] },
    });
    if (prevOrders > 0) {
      return { valid: false, reason: "Referral codes can only be used on your first order" };
    }
  }

  // Soft multi-account guard: the same phone number may not refer and be referred.
  const normalizedPhone = String(shippingPhone || "").replace(/[^0-9]/g, "");
  if (normalizedPhone) {
    const referrer = await Users.findById(referral.userId).select("phoneNo").lean();
    const referrerPhone = String(referrer?.phoneNo || "").replace(/[^0-9]/g, "");
    if (referrerPhone && referrerPhone === normalizedPhone) {
      return { valid: false, reason: "Referral code cannot be used with the referrer's own contact number" };
    }
  }

  const referrer = await Users.findById(referral.userId).select("username").lean();
  return {
    valid: true,
    referral,
    referrerName: referrer?.username || "A friend",
  };
}

/**
 * Create the PENDING reward for a referred order. Idempotent via the
 * unique orderId index (a duplicate create simply returns the existing).
 */
export async function createPendingReward(order) {
  if (!order || !order.referrerId || !order.referralCode) return null;
  // Guard against the async-create race: never create a pending reward for an
  // order that is already cancelled (the cancel hook may have run first). The
  // order passed in can be STALE (createPendingReward is fire-and-forget at
  // checkout and can race with a customer/admin cancellation), so re-read the
  // current status from the database — a cancelled order must never produce a
  // reward, and handleOrderCancelled may already have run.
  const freshOrder = await Order.findById(order._id).select("status").lean();
  if (!freshOrder || freshOrder.status === "Cancelled") return null;
  const settings = await getReferralSettings();
  if (!settings.programEnabled) return null;

  const existing = await ReferralReward.findOne({ orderId: order._id });
  if (existing) return existing;

  const base = Number(order.itemsPrice) || 0;
  let amount = Math.round((base * settings.rewardPercentage) / 100);
  if (settings.maxReward > 0 && amount > settings.maxReward) amount = settings.maxReward;

  const reward = await ReferralReward.create({
    referrerId: order.referrerId,
    referredUserId: order.user,
    orderId: order._id,
    code: order.referralCode,
    orderTotal: base,
    percentage: settings.rewardPercentage,
    cap: settings.maxReward,
    amount,
    status: "pending",
  });

  await ReferralWallet.updateOne(
    { userId: order.referrerId },
    { $inc: { pendingRewards: 1 } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  await notifyUser(order.referrerId, {
    title: "💰 Referral Reward Pending",
    message: `A friend placed an order using your code ${order.referralCode}. You will earn Rs ${amount.toLocaleString()} once their order is delivered.`,
    link: "/profile/referral",
  });
  return reward;
}

/* -----------------------------------------------------------
   ORDER LIFECYCLE HOOKS (idempotent)
   ----------------------------------------------------------- */

/**
 * Called when an order reaches "Delivered":
 *  1. Unlocks a referral code for the BUYER if they crossed the threshold.
 *  2. Claims + credits the referrer's pending reward (exactly once).
 *
 * DOUBLE-CREDIT SAFETY (claim-first): the reward is atomically transitioned
 * pending/approved → credited BEFORE any wallet money moves. Only one process
 * can win that transition, and the wallet credit is anchored to a unique
 * ledger entry ({rewardId, source}), so a referral reward can NEVER be
 * credited twice — even if the backend crashes mid-credit or multiple
 * instances dispatch this hook concurrently.
 */
export async function handleOrderDelivered(order) {
  try {
    await ensureReferralForUser(order.user);
  } catch (err) {
    console.error("[Referral] Buyer unlock on delivery failed:", err.message || err);
  }

  if (!order.referrerId || !order.referralCode) return;

  let reward = await ReferralReward.findOne({ orderId: order._id });
  if (!reward) {
    // Self-heal: reward doc was never created (e.g. transient failure at checkout).
    try {
      reward = await createPendingReward(order);
    } catch (err) {
      console.error("[Referral] Self-heal reward create failed:", err.message || err);
    }
  }
  if (!reward) return;

  // ── CLAIM FIRST ────────────────────────────────────────────────────────────
  // Atomically move pending/approved → credited. Whoever wins this owns the
  // payout; everyone else sees the reward as already credited/cancelled/clawed.
  const claimed = await ReferralReward.findOneAndUpdate(
    { _id: reward._id, status: { $in: ["pending", "approved"] } },
    { $set: { status: "credited", creditedAt: new Date() } },
    { new: true }
  );

  if (!claimed) {
    // Another process won the claim (or the reward was cancelled/clawed back).
    // If the reward is genuinely credited, reconcile a credit that a previous
    // attempt may have crashed between the claim and the wallet transfer —
    // idempotent, so money is never lost AND never duplicated.
    const current = await ReferralReward.findById(reward._id)
      .select("status amount referrerId orderId code")
      .lean();
    if (current && current.status === "credited") {
      try {
        await reconcileRewardCredit(current);
      } catch (err) {
        console.error("[Referral] Credit reconciliation failed:", err.message || err);
      }
    }
    return;
  }

  await ReferralWallet.updateOne(
    { userId: order.referrerId },
    { $inc: { pendingRewards: -1, successfulReferrals: 1 } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  await creditWalletIdempotent(claimed);

  await Referral.updateOne(
    { userId: order.referrerId },
    { $inc: { timesUsed: 1, totalEarned: claimed.amount } }
  );

  await notifyUser(order.referrerId, {
    title: "🎉 Referral Reward Credited!",
    message: `Rs ${claimed.amount.toLocaleString()} has been added to your wallet. Keep sharing your code ${claimed.code}!`,
    link: "/profile/referral",
  });
}

/**
 * Called when an order is cancelled:
 *  1. Cancels the pending reward (never credits cancelled orders).
 *  2. Refunds any wallet amount redeemed on the order (idempotent).
 */
export async function handleOrderCancelled(order) {
  if (order.referrerId && order.referralCode) {
    // Cancel a reward that never got paid (pending, or the momentary approved
    // state) — a cancelled order must never produce a reward.
    const cancelled = await ReferralReward.findOneAndUpdate(
      { orderId: order._id, status: { $in: ["pending", "approved"] } },
      { $set: { status: "cancelled", cancelledAt: new Date() } },
      { new: true }
    );
    if (cancelled) {
      await ReferralWallet.updateOne(
        { userId: order.referrerId },
        { $inc: { pendingRewards: -1 } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      await notifyUser(order.referrerId, {
        title: "Referral Reward Cancelled",
        message: `The order using your code ${cancelled.code} was cancelled, so no reward was issued.`,
        link: "/profile/referral",
      });
    } else {
      // The reward was already credited (the order was Delivered first, then
      // reversed/refunded) — claw it back so the referrer never keeps money
      // from a reversed order. Idempotent: only acts once per credited reward.
      try {
        await clawbackReward(order);
      } catch (err) {
        console.error("[Referral] Reward clawback failed:", err.message || err);
      }
    }
  }

  if (order.walletRedemptionAmount > 0 && order.user) {
    const alreadyRefunded = await WalletTransaction.exists({
      orderId: order._id,
      source: "wallet_refund",
    });
    if (!alreadyRefunded) {
      await creditWallet(order.user, {
        amount: order.walletRedemptionAmount,
        source: "wallet_refund",
        orderId: order._id,
        note: "Order cancelled — wallet amount refunded",
      });
      const serial = order.serialNumber ? `#${order.serialNumber}` : String(order._id).slice(-8).toUpperCase();
      await notifyUser(order.user, {
        title: "↩️ Referral Wallet Refunded",
        message: `Rs ${order.walletRedemptionAmount.toLocaleString()} from order ${serial} was returned to your referral wallet.`,
        link: "/profile/referral",
      });
    }
  }
}

/* -----------------------------------------------------------
   CLAWBACK + CREDIT SAFETY HELPERS
   ----------------------------------------------------------- */

/**
 * Credit a reward's wallet balance EXACTLY ONCE.
 *
 * The ledger entry is inserted FIRST under the unique {rewardId, source}
 * partial index — the process that wins the insert owns the payout, and any
 * concurrent duplicate insert fails with a unique-key error and is ignored.
 * The wallet balance $inc happens only after the ledger records the credit,
 * so no money moves unless the immutable ledger already says it did.
 */
async function creditWalletIdempotent(reward) {
  if (!reward || !reward.amount || reward.amount <= 0) return null;

  let entry;
  try {
    entry = await WalletTransaction.create({
      userId: reward.referrerId,
      type: "credit",
      source: "referral_reward",
      amount: reward.amount,
      balanceAfter: 0, // patched to the real balance after the $inc below
      orderId: reward.orderId,
      rewardId: reward._id,
      note: `Referral reward — order using ${reward.code}`,
    });
  } catch (err) {
    // E11000 duplicate key: another process already owns this reward's credit.
    if (err && err.code === 11000) return null;
    throw err;
  }

  // Guard against a concurrent reversal: if the reward was clawed back or
  // cancelled after we claimed it but before the money landed, do NOT pay it
  // out — remove our just-inserted ledger entry and abort.
  const stillCredited = await ReferralReward.exists({
    _id: reward._id,
    status: "credited",
  });
  if (!stillCredited) {
    await WalletTransaction.deleteOne({ _id: entry._id });
    return null;
  }

  const wallet = await ReferralWallet.findOneAndUpdate(
    { userId: reward.referrerId },
    { $inc: { balance: reward.amount, lifetimeEarned: reward.amount } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await WalletTransaction.updateOne(
    { _id: entry._id },
    { $set: { balanceAfter: wallet.balance } }
  );
  return wallet;
}

/**
 * Reconcile a reward credit that may have been interrupted by a crash or a
 * concurrent delivery-hook dispatch. The immutable ledger is the source of
 * truth: the wallet balance is rebuilt from it (top-up only — a higher
 * balance is never clamped) and the denormalized pending/successful counters
 * are recomputed from the rewards collection. Idempotent and race-safe.
 */
async function reconcileRewardCredit(reward) {
  const txn = await WalletTransaction.findOne({
    rewardId: reward._id,
    source: "referral_reward",
  }).lean();

  if (!txn) {
    // The credit never started — apply it now (idempotent).
    await creditWalletIdempotent(reward);
    return;
  }

  // Ledger entry exists but the wallet $inc may never have landed (crash
  // between the two operations). Rebuild the expected balance from the ledger
  // and top the wallet up when it is short — but only for STALE entries. A
  // fresh entry belongs to a credit that is still in flight (ledger insert →
  // balance $inc are adjacent awaits); topping up then would double-credit
  // once the in-flight $inc lands. A crashed credit is permanent, so it is
  // repaired on this or any later reconcile after the grace period.
  const FRESH_CREDIT_GRACE_MS = 15 * 1000;
  const fresh = Date.now() - new Date(txn.createdAt).getTime() < FRESH_CREDIT_GRACE_MS;

  const [agg] = await WalletTransaction.aggregate([
    { $match: { userId: reward.referrerId } },
    {
      $group: {
        _id: null,
        credits: {
          $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
        },
        debits: {
          $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
        },
      },
    },
  ]);
  const expected = Math.max(0, (agg?.credits || 0) - (agg?.debits || 0));

  const wallet = await ReferralWallet.findOne({ userId: reward.referrerId });
  if (!fresh && wallet && wallet.balance < expected) {
    // CAS: only apply the top-up if the balance hasn't moved since we read it,
    // so a concurrent in-flight change can never be overwritten.
    const topped = await ReferralWallet.findOneAndUpdate(
      { _id: wallet._id, balance: wallet.balance },
      { $set: { balance: expected } },
      { new: true }
    );
    if (topped) {
      await WalletTransaction.updateOne(
        { _id: txn._id },
        { $set: { balanceAfter: expected } }
      );
    }
  }

  // Recompute the denormalized counters so a crash between the claim and the
  // counter update self-heals too.
  const [pendingCount, creditedCount] = await Promise.all([
    ReferralReward.countDocuments({
      referrerId: reward.referrerId,
      status: "pending",
    }),
    ReferralReward.countDocuments({
      referrerId: reward.referrerId,
      status: "credited",
    }),
  ]);
  await ReferralWallet.updateOne(
    { userId: reward.referrerId },
    {
      $set: {
        pendingRewards: pendingCount,
        successfulReferrals: creditedCount,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Claw back a CREDITED referral reward when a delivered order is later
 * reversed/refunded (admin moves Delivered → Cancelled, or a future Refunded
 * flow). Requirements:
 *  - only a "credited" reward is reversed (never pending/cancelled)
 *  - the same amount is deducted from the referrer's wallet (guarded, so the
 *    balance never goes negative if part of it was already spent)
 *  - a WalletTransaction debit entry is recorded
 *  - the reward is marked "clawed_back" atomically → idempotent, a reward can
 *    never be clawed back twice
 *  - the referrer is notified
 */
export async function clawbackReward(order) {
  if (!order || !order.referrerId || !order.referralCode) return null;

  // Atomically claim the reward for clawback. Only a "credited" reward can be
  // clawed back, and only one process can win this transition.
  const reward = await ReferralReward.findOneAndUpdate(
    { orderId: order._id, status: "credited" },
    { $set: { status: "clawed_back", clawedBackAt: new Date() } },
    { new: true }
  );
  if (!reward) return null;

  const amount = reward.amount || 0;
  if (amount > 0) {
    const wallet = await ReferralWallet.findOne({ userId: order.referrerId });
    const available = wallet && wallet.balance > 0 ? wallet.balance : 0;
    const actualDebit = Math.min(amount, available);

    if (actualDebit > 0) {
      await ReferralWallet.findOneAndUpdate(
        { userId: order.referrerId, balance: { $gte: actualDebit } },
        { $inc: { balance: -actualDebit } },
        { new: true }
      );
    }

    // The referral is reversed regardless of how much balance remained (a
    // credited reward implies the wallet exists with a positive counter).
    await ReferralWallet.updateOne(
      { userId: order.referrerId },
      { $inc: { successfulReferrals: -1 } }
    );

    await WalletTransaction.create({
      userId: order.referrerId,
      type: "debit",
      source: "reward_clawback",
      amount: actualDebit,
      balanceAfter: Math.max(0, available - actualDebit),
      orderId: order._id,
      rewardId: reward._id,
      clawedBackAt: new Date(),
      note: `Referral reward reversed — order using ${reward.code} was refunded/cancelled after delivery`,
    });

    // Keep the referral read-model consistent (clamped, never negative).
    const referral = await Referral.findOne({ userId: order.referrerId });
    if (referral) {
      await Referral.updateOne(
        { userId: order.referrerId },
        {
          $set: {
            timesUsed: Math.max(0, (referral.timesUsed || 0) - 1),
            totalEarned: Math.max(0, (referral.totalEarned || 0) - amount),
          },
        }
      );
    }
  }

  await notifyUser(order.referrerId, {
    title: "↩️ Referral Reward Reversed",
    message: `Rs ${amount.toLocaleString()} from your referral reward was returned to the store because the order using your code ${reward.code} was reversed after delivery.`,
    link: "/profile/referral",
  });

  return reward;
}

/* -----------------------------------------------------------
   CHECKOUT: WALLET REDEMPTION (reserve → confirm / rollback)
   ----------------------------------------------------------- */

/**
 * Reserve (debit) wallet funds before the order is created. Returns
 * { ok, amount, transaction, reason }. If order creation later fails,
 * call releaseWalletRedemption() to refund — no MongoDB transactions
 * required and the debit itself is guarded atomically.
 */
export async function reserveWalletRedemption(userId, requestedAmount, { itemsPrice, shippingPrice, discountAmount }) {
  const amount = Math.round(Number(requestedAmount) || 0);
  if (amount <= 0) return { ok: true, amount: 0, transaction: null };

  const settings = await getReferralSettings();
  if (!settings.programEnabled) {
    return { ok: false, reason: "Referral wallet is currently unavailable." };
  }

  const wallet = await ReferralWallet.findOne({ userId });
  if (!wallet || wallet.balance <= 0) {
    return { ok: false, reason: "You have no referral wallet balance." };
  }

  const maxUsage = Math.floor(((itemsPrice || 0) * settings.walletUsagePercent) / 100);
  const payable = Math.max(0, (itemsPrice || 0) + (shippingPrice || 0) - (discountAmount || 0));
  const usable = Math.min(amount, maxUsage, wallet.balance, payable);

  if (usable <= 0) {
    return { ok: false, reason: "Referral wallet cannot be applied to this order (usage limit reached)." };
  }

  const debited = await debitWallet(userId, usable, {
    source: "wallet_redeem",
    note: "Applied towards order at checkout",
  });
  if (!debited) return { ok: false, reason: "Insufficient referral wallet balance." };

  return { ok: true, amount: usable, transaction: debited.transaction };
}

/** Refund a reservation when the order could not be created. */
export async function releaseWalletRedemption(userId, amount, transactionId) {
  if (!amount || amount <= 0) return;
  await creditWallet(userId, {
    amount,
    source: "wallet_refund",
    note: "Order could not be placed — wallet amount returned",
  });
  if (transactionId) {
    await WalletTransaction.updateOne(
      { _id: transactionId, orderId: null },
      { $set: { note: "Order could not be placed — reversed", expiredAt: new Date() } }
    );
  }
}

/* -----------------------------------------------------------
   EXPIRY RULES (lazy, FIFO, never over-debits)
   ----------------------------------------------------------- */
export async function applyRewardExpiry(userId) {
  const settings = await getReferralSettings();
  if (!settings.rewardExpiryMonths || settings.rewardExpiryMonths <= 0) return 0;

  const wallet = await ReferralWallet.findOne({ userId });
  if (!wallet || wallet.balance <= 0) return 0;

  const cutoff = new Date(Date.now() - settings.rewardExpiryMonths * 30 * 24 * 60 * 60 * 1000);

  // All expirable credits (oldest first, not yet expired).
  const credits = await WalletTransaction.find({
    userId,
    type: "credit",
    source: { $in: ["referral_reward", "wallet_refund"] },
    expiredAt: { $exists: false },
  })
    .sort({ createdAt: 1 })
    .select("_id amount createdAt expiresAt")
    .lean();

  if (credits.length === 0) return 0;

  // FIFO accounting: lifetime spending is consumed from the OLDEST credits
  // first, so a partially-spent expired credit only expires its REMAINING
  // amount — fresh credits are never over-expired.
  const spent = Math.max(0, (wallet.lifetimeEarned || 0) - (wallet.balance || 0));
  let remainingSpent = spent;

  let toExpire = 0;
  const expiredIds = [];
  for (const credit of credits) {
    let remaining = credit.amount;
    if (remainingSpent > 0) {
      const consumed = Math.min(remaining, remainingSpent);
      remaining -= consumed;
      remainingSpent -= consumed;
    }
    if (remaining <= 0) continue;
    const matured =
      credit.createdAt &&
      new Date(credit.createdAt) < cutoff &&
      (!credit.expiresAt || new Date(credit.expiresAt) < new Date());
    if (matured) {
      toExpire += remaining;
      expiredIds.push(credit._id);
    }
  }

  if (expiredIds.length === 0 || toExpire <= 0) return 0;
  const expire = Math.min(toExpire, wallet.balance);
  if (expire <= 0) return 0;

  // Direct guarded debit (expiry is not a "redemption" — lifetimeRedeemed
  // must stay untouched).
  const after = await ReferralWallet.findOneAndUpdate(
    { userId, balance: { $gte: expire } },
    { $inc: { balance: -expire } },
    { new: true }
  );
  if (!after) return 0;

  await WalletTransaction.create({
    userId,
    type: "debit",
    source: "reward_expiry",
    amount: expire,
    balanceAfter: after.balance,
    note: `${expiredIds.length} reward credit(s) expired`,
  });
  await WalletTransaction.updateMany(
    { _id: { $in: expiredIds } },
    { $set: { expiredAt: new Date() } }
  );
  return expire;
}

/**
 * Dispatch the order-status referral hooks (delivered → credit, cancelled →
 * cancel/refund) from ANY status-transition path. Fire-and-forget and
 * idempotent — safe to call from both orderController and trackingController.
 */
export function dispatchOrderStatusHooks(order, status) {
  if (!order) return;
  if (status === "Delivered") {
    handleOrderDelivered(order).catch((err) =>
      console.error(`[Referral] Delivered hook failed for order ${order._id}:`, err.message || err)
    );
  } else if (status === "Cancelled") {
    handleOrderCancelled(order).catch((err) =>
      console.error(`[Referral] Cancel hook failed for order ${order._id}:`, err.message || err)
    );
  }
}

/* -----------------------------------------------------------
   NOTIFICATIONS (in-app + push + real-time Pusher)
   Mirrors the existing order-tracking notification pattern so the
   customer sees these instantly without polling.
   ----------------------------------------------------------- */

import { publishToUsers } from "./pusherHelpers.js";

export async function notifyUser(userId, { title, message, link = null }) {
  try {
    const notification = await Notification.create({ userId, title, message, link });

    try {
      const { sendPushToUser } = await import("./webPush.js");
      await sendPushToUser(String(userId), { title, body: message, link });
    } catch (pushErr) {
      console.error("[Referral] Push failed:", pushErr.message || pushErr);
    }

    // Real-time delivery via Pusher data channels
    const userIdStr = String(userId);
    try {
      await publishToUsers(userIdStr, "notification:new", notification);
    } catch {
      // non-fatal — notification is in the DB and will appear on next page load
    }
  } catch (notifErr) {
    console.error("[Referral] Notification create failed:", notifErr.message || notifErr);
  }
}
