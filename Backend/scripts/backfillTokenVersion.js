/**
 * Backfill tokenVersion for users whose MongoDB documents were created
 * before the tokenVersion field was added to the User schema.
 *
 * The field is used by verifyToken in commonFunctions.js to detect
 * when a user's password has been changed (old tokens are invalidated
 * by incrementing tokenVersion). Users without this field get undefined
 * from .lean() queries, which causes a version mismatch with tokens
 * signed with the Mongoose default of 0.
 *
 * Run:
 *   node Backend/scripts/backfillTokenVersion.js
 *
 * Or from the Backend directory:
 *   npx node scripts/backfillTokenVersion.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Users from "../Models/Users.js";
import { connectDB } from "../utils/commonFunctions.js";

dotenv.config();

async function main() {
  console.log("🔌 Connecting to database...");
  await connectDB();

  console.log("\n🔍 Finding users without tokenVersion...");

  // Find users where tokenVersion doesn't exist or is null
  const usersMissing = await Users.countDocuments({
    $or: [
      { tokenVersion: { $exists: false } },
      { tokenVersion: null },
    ],
  });

  console.log(`   Found ${usersMissing} users missing tokenVersion`);

  if (usersMissing === 0) {
    console.log("\n✅ No users need backfilling. All good!");
    process.exit(0);
  }

  // Backfill: set tokenVersion to 0 for all users that don't have it
  const result = await Users.updateMany(
    {
      $or: [
        { tokenVersion: { $exists: false } },
        { tokenVersion: null },
      ],
    },
    { $set: { tokenVersion: 0 } },
  );

  console.log(`\n✅ Backfilled tokenVersion for ${result.modifiedCount} users`);
  console.log(`   (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);

  // Verify
  const remainingMissing = await Users.countDocuments({
    $or: [
      { tokenVersion: { $exists: false } },
      { tokenVersion: null },
    ],
  });

  if (remainingMissing > 0) {
    console.warn(`   ⚠️  ${remainingMissing} users still missing tokenVersion`);
  } else {
    console.log("\n🎉 All users now have tokenVersion: 0");
  }

  console.log("\n========================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
