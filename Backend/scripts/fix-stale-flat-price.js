/**
 * One-time cleanup script: Fix stale flat price on products that have
 * variantPricing set but also carry a non-zero flat price field.
 *
 * Root cause: The update handler previously always overwrote product.price
 * with the loaded value, even when size-wise pricing was enabled. This left
 * an inconsistent document with BOTH a stale flat price AND variant prices.
 *
 * Usage:
 *   DRY RUN (default — logs what WOULD change):
 *     node scripts/fix-stale-flat-price.js
 *
 *   APPLY (actually modifies the database):
 *     node scripts/fix-stale-flat-price.js --apply
 *
 * Requires MONGODB_URI environment variable (or defaults to localhost).
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/irhasinn";
const DRY_RUN = !process.argv.includes("--apply");

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  variantPricing: mongoose.Schema.Types.Mixed,
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
}, { strict: false });

const Product = mongoose.model("Product", productSchema);

async function main() {
  console.log(`\n${DRY_RUN ? "🔍 DRY RUN" : "⚠️  APPLY MODE"} — ${DRY_RUN ? "no changes will be made" : "database WILL be modified"}\n`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB\n");

    // Find products where variantPricing is non-empty AND price > 0
    const affectedProducts = await Product.find({
      $and: [
        { variantPricing: { $exists: true, $ne: null } },
        { "variantPricing": { $type: "object" } },
        { price: { $gt: 0 } },
      ],
    }).lean();

    // Additional filter: variantPricing must have at least one key
    const trulyAffected = affectedProducts.filter((p) => {
      const vp = p.variantPricing;
      return vp && typeof vp === "object" && Object.keys(vp).length > 0;
    });

    if (trulyAffected.length === 0) {
      console.log("✅ No affected products found. Nothing to clean up.\n");
      return;
    }

    console.log(`Found ${trulyAffected.length} product(s) with stale flat price + variantPricing:\n`);
    console.log("─".repeat(80));
    console.log(`${"ID".padEnd(26)} ${"Name".padEnd(35)} ${"Price".padEnd(10)} Variant Keys`);
    console.log("─".repeat(80));

    for (const product of trulyAffected) {
      const vpKeys = Object.keys(product.variantPricing || {}).join(", ");
      const displayName = (product.name || "Unknown").substring(0, 33);
      console.log(
        `${String(product._id).padEnd(26)} ${displayName.padEnd(35)} Rs ${(product.price || 0).toString().padEnd(7)} [${vpKeys}]`
      );
    }

    console.log("─".repeat(80));
    console.log(`\nTotal: ${trulyAffected.length} product(s) to fix\n`);

    if (DRY_RUN) {
      console.log("🔍 DRY RUN complete. Run with --apply to execute changes.\n");
    } else {
      let fixed = 0;
      for (const product of trulyAffected) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { price: 0 } }
        );
        fixed++;
        console.log(`  ✓ Fixed: ${product._id} (${product.name}) — price set to 0`);
      }
      console.log(`\n✅ Applied fix to ${fixed} product(s).\n`);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
