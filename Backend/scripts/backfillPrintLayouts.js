/**
 * Backfill printLayout for customizable products created before the
 * "AI Live Custom Preview" feature.
 *
 * Runs Gemini Vision ONCE per product image (reusing the exact same
 * prompt / clamping / model-fallback logic as the admin editor via
 * detectPrintLayoutFromImageUrl) and stores the result in the product's
 * `printLayout` field. Afterwards the customer preview renders instantly
 * from the stored layout — no further AI calls, ever.
 *
 * Run (from the project root or the Backend directory):
 *   node Backend/scripts/backfillPrintLayouts.js            # missing layouts only
 *   node Backend/scripts/backfillPrintLayouts.js --force    # re-analyze ALL customizable products
 *   node Backend/scripts/backfillPrintLayouts.js --limit=25 # cap how many to process
 *   node Backend/scripts/backfillPrintLayouts.js --delay=2000 # ms between calls (Gemini quota)
 *   node Backend/scripts/backfillPrintLayouts.js --dry-run  # count only — no AI calls, no writes
 *
 * Requires: MONGO and GEMINI_API_KEY in the Backend .env
 * (the same variables the server uses).
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../Models/Product.js";
import { connectDB } from "../utils/commonFunctions.js";
import { detectPrintLayoutFromImageUrl } from "../Controllers/printLayoutController.js";

dotenv.config();

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const delayArg = args.find((a) => a.startsWith("--delay="));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : 0;
const DELAY_MS = delayArg ? Math.max(0, Number(delayArg.split("=")[1]) || 0) : 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("🔌 Connecting to database...");
  await connectDB();

  if (!process.env.GEMINI_API_KEY) {
    console.error("[ENV ERROR] GEMINI_API_KEY is not set — nothing can be analyzed.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const query = {
    customizable: true,
    "images.0": { $exists: true, $ne: null },
  };
  if (!force) {
    // Only products that have never been analyzed (idempotent — a stored
    // layout, even {customizable:false}, counts as analyzed).
    query.$or = [{ printLayout: { $exists: false } }, { printLayout: null }];
  }

  const total = await Product.countDocuments(query);
  console.log(
    `\n🔍 Found ${total} customizable product(s)` +
      (force
        ? " (re-analyzing ALL, --force)"
        : " without a stored print layout") +
      ".",
  );

  if (total === 0) {
    console.log("Nothing to do. 🎉");
    await mongoose.disconnect();
    process.exit(0);
  }

  if (dryRun) {
    console.log(
      "Dry run — no AI calls will be made and nothing will be written.",
    );
    console.log("Re-run without --dry-run to analyze them.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(
    `→ Analyzing (first product image only, matching the customer preview).\n`,
  );

  let baseQuery = Product.find(query).sort({ createdAt: 1 });
  if (LIMIT > 0) baseQuery = baseQuery.limit(LIMIT);

  let analyzed = 0;
  let saved = 0;
  let notPersonalizable = 0;
  let failed = 0;
  const failures = [];

  for await (const product of baseQuery.cursor()) {
    const imageUrl = product.images?.[0]?.url;
    if (!imageUrl) {
      failed++;
      failures.push({ id: product._id, name: product.name, error: "No image URL" });
      console.log(`  ✗ ${product.name} — no image URL`);
      continue;
    }

    try {
      const result = await detectPrintLayoutFromImageUrl(imageUrl);
      if (result.error) {
        failed++;
        failures.push({ id: product._id, name: product.name, error: result.error });
        console.log(`  ✗ ${product.name} (${product._id}) — ${result.error}`);
        continue;
      }

      const layout = result.layout;
      if (!layout.customizable) {
        notPersonalizable++;
        console.log(
          `  ◦ ${product.name} — analyzed, no printed sample text detected (saved customizable:false)`,
        );
      } else {
        const tl = layout.textLayer || {};
        console.log(
          `  ✓ ${product.name} — sample "${layout.sampleText || "?"}" at ` +
            `${Math.round((tl.x || 0) * 100)}%,${Math.round((tl.y || 0) * 100)}% · ` +
            `${tl.fontSize}px · ${tl.rotation || 0}°`,
        );
        saved++;
      }

      await Product.updateOne(
        { _id: product._id },
        { $set: { printLayout: layout } },
      );
      analyzed++;
    } catch (err) {
      failed++;
      failures.push({ id: product._id, name: product.name, error: err?.message || String(err) });
      console.log(`  ✗ ${product.name} (${product._id}) — ${err?.message || err}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\n📊 Summary: analyzed=${analyzed} · withTextLayer=${saved} · noSampleText=${notPersonalizable} · failed=${failed}`,
  );

  if (failures.length > 0) {
    console.log("\n⚠️  Failures (re-run the script to retry just these):");
    failures.forEach((f) =>
      console.log(`  - ${f.name} (${f.id}): ${f.error}`),
    );
  }

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[Backfill] fatal error:", err?.message || err);
  await mongoose.disconnect();
  process.exit(1);
});
