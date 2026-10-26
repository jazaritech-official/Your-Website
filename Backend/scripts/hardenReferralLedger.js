/**
 * One-time hardening migration for the Referral Rewards ledger + checkout.
 *
 * Fixes:
 *   1. SYNCES the stored referral reward percentage to 5% (only when it still
 *      holds the old 10% default — a manually-tuned value is never touched).
 *   2. DEDUPLICATES wallet transactions sharing the same rewardId (only
 *      possible if the old pre-fix code actually double-credited a reward).
 *      The duplicate ledger entries are removed and the duplicated amounts are
 *      subtracted from the affected wallets so balances match the immutable
 *      ledger again.
 *   3. BUILDS the unique partial index on WalletTransaction {rewardId, source}
 *      — the hard database guarantee that a referral reward can never be
 *      credited twice, even with concurrent delivery hooks / multiple
 *      instances.
 *   4. BUILDS the unique sparse index on Order {idempotencyKey} — the checkout
 *      duplicate-submission guard.
 *
 * IMPORTANT: run this BEFORE deploying the new code, while the store is quiet
 * (it de-duplicates live ledger data). Safe to re-run — idempotent.
 *
 * Run from the Backend directory:
 *   node scripts/hardenReferralLedger.js
 *   node scripts/hardenReferralLedger.js --reconcile-wallets   # also rebuild
 *                                      every wallet balance from the ledger
 *
 * Requires: MONGO in the Backend .env (same variable the server uses).
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { WalletTransaction } from "../Models/WalletTransaction.js";
import { ReferralWallet } from "../Models/ReferralWallet.js";
import { ReferralSettings } from "../Models/ReferralSettings.js";
import { Order } from "../Models/Orders.js";
import { connectDB } from "../utils/commonFunctions.js";

dotenv.config();

const args = process.argv.slice(2);
const reconcileWallets = args.includes("--reconcile-wallets");

async function syncRewardPercentage() {
  // The referral reward was changed from 10% to 5%. The singleton settings
  // document stores its own copy — update it ONLY if it still holds the old
  // default so a manually-tuned admin value is never overwritten.
  const res = await ReferralSettings.updateOne(
    { key: "referral", rewardPercentage: 10 },
    { $set: { rewardPercentage: 5 } }
  );
  return res.modifiedCount || 0;
}

async function dedupeLedger() {
  // Group referral_reward credits by rewardId, keeping the EARLIEST entry.
  const groups = await WalletTransaction.aggregate([
    { $match: { rewardId: { $type: "objectId" }, source: "referral_reward" } },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $group: {
        _id: { rewardId: "$rewardId", source: "$source" },
        count: { $sum: 1 },
        keepId: { $first: "$_id" },
        allIds: { $push: "$_id" },
        userId: { $first: "$userId" },
        keepAmount: { $first: "$amount" },
        totalAmount: { $sum: "$amount" },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let removed = 0;
  let walletsAdjusted = 0;

  for (const group of groups) {
    const duplicateIds = group.allIds.filter(
      (id) => String(id) !== String(group.keepId)
    );
    const excess = (group.totalAmount || 0) - (group.keepAmount || 0);
    if (duplicateIds.length > 0) {
      await WalletTransaction.deleteMany({ _id: { $in: duplicateIds } });
      removed += duplicateIds.length;
    }
    if (excess > 0) {
      const wallet = await ReferralWallet.findOne({ userId: group.userId });
      if (wallet) {
        await ReferralWallet.updateOne(
          { userId: group.userId },
          {
            $set: {
              balance: Math.max(0, (wallet.balance || 0) - excess),
              lifetimeEarned: Math.max(0, (wallet.lifetimeEarned || 0) - excess),
            },
          }
        );
        walletsAdjusted += 1;
      }
    }
  }

  return { groups: groups.length, removed, walletsAdjusted };
}

async function reconcileAllWallets() {
  const wallets = await ReferralWallet.find({})
    .select("_id userId balance lifetimeEarned")
    .lean();
  let fixed = 0;

  for (const wallet of wallets) {
    const [agg] = await WalletTransaction.aggregate([
      { $match: { userId: wallet.userId } },
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
    const expected = Math.max(
      0,
      (agg?.credits || 0) - (agg?.debits || 0)
    );
    if (expected !== (wallet.balance || 0)) {
      await ReferralWallet.updateOne(
        { _id: wallet._id },
        { $set: { balance: expected } }
      );
      fixed += 1;
    }
  }
  return { scanned: wallets.length, fixed };
}

async function main() {
  console.log("🔌 Connecting to database...");
  await connectDB();

  console.log("\n── Step 1/4: Syncing reward percentage to 5% (old default only) ──");
  const percentageSynced = await syncRewardPercentage();
  console.log(`   Settings docs updated from 10% to 5%: ${percentageSynced}`);

  console.log("\n── Step 2/4: De-duplicating referral ledger ──");
  const dedupe = await dedupeLedger();
  console.log(
    `   Groups with duplicates: ${dedupe.groups}, duplicate entries removed: ${dedupe.removed}, wallets adjusted: ${dedupe.walletsAdjusted}`
  );

  console.log("\n── Step 3/4: Building unique ledger index (anti double-credit) ──");
  await WalletTransaction.collection.createIndex(
    { rewardId: 1, source: 1 },
    {
      unique: true,
      partialFilterExpression: { rewardId: { $type: "objectId" } },
      name: "rewardId_1_source_1_unique",
    }
  );
  console.log("   ✅ WalletTransaction {rewardId, source} unique index created");

  console.log("\n── Step 4/4: Building unique checkout idempotency index ──");
  await Order.collection.createIndex(
    { idempotencyKey: 1 },
    { unique: true, sparse: true, name: "idempotencyKey_1_unique" }
  );
  console.log("   ✅ Order {idempotencyKey} unique sparse index created");

  if (reconcileWallets) {
    console.log("\n── Optional: rebuilding all wallet balances from ledger ──");
    const recon = await reconcileAllWallets();
    console.log(
      `   Wallets scanned: ${recon.scanned}, balances corrected: ${recon.fixed}`
    );
  }

  console.log("\n✅ Hardening migration complete.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[Migration failed]", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
