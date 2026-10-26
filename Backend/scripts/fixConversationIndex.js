/**
 * One-time maintenance script: align the Conversation collection's
 * compound index with the new partial unique index definition.
 *
 * WHY: Previously the unique index was `{ customerId: 1, orderId: 1 }`
 * WITHOUT a partial filter. MongoDB unique indexes treat multiple
 * documents with a missing/null orderId as duplicates, so creating two
 * order-less "direct" conversations for the same customer would fail
 * with E11000. The model now declares a partial unique index that only
 * covers documents where orderId is an ObjectId, so:
 *   - order-based conversations stay unique per { customerId, orderId }
 *   - direct (order-less) conversations never collide
 *
 * NOTE: This script targets the DATABASE THAT process.env.MONGO POINTS TO.
 * Run it manually once after deploying the model change:
 *
 *   node scripts/fixConversationIndex.js
 */
import mongoose from "mongoose";
import { connectDB } from "../utils/commonFunctions.js";
import { Conversation } from "../Models/Conversation.js";

const LEGACY_INDEX_NAME = "customerId_1_orderId_1";

async function main() {
  await connectDB();

  const collection = Conversation.collection;
  const indexes = await collection.indexes();
  const legacy = indexes.find((idx) => idx.name === LEGACY_INDEX_NAME);

  if (legacy) {
    if (!legacy.partialFilterExpression) {
      console.log(
        `Dropping legacy non-partial unique index "${LEGACY_INDEX_NAME}"...`
      );
      await collection.dropIndex(LEGACY_INDEX_NAME);
      console.log("Dropped.");
    } else {
      console.log(
        `Index "${LEGACY_INDEX_NAME}" already has a partial filter — nothing to do.`
      );
    }
  } else {
    console.log(`Index "${LEGACY_INDEX_NAME}" not found — nothing to drop.`);
  }

  // Recreate / ensure the correct (partial) index via mongoose syncIndexes.
  await Conversation.syncIndexes();
  console.log("Conversation indexes synced:");
  for (const idx of await collection.indexes()) {
    console.log("  -", idx.name, JSON.stringify(idx.key));
  }

  await mongoose.connection.close();
  console.log("Done.");
}

main().catch(async (err) => {
  console.error("Index fix failed:", err.message || err);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
