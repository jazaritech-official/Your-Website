/**
 * LIVE forensic test — runs the REAL detectPrintLayoutFromImageUrl (the exact
 * function the Analyze Print Layout endpoint calls) end-to-end against a
 * public image, using the real GEMINI_API_KEY. Makes ONE Gemini vision call.
 *
 * Usage: node Backend/scripts/livePrintLayoutTest.js <imageUrl>
 */
import { detectPrintLayoutFromImageUrl } from "../Controllers/printLayoutController.js";
import dotenv from "dotenv";
dotenv.config();

const url = process.argv[2] || "https://picsum.photos/seed/irhasinn-live/2400/1600";

console.log("\n[LIVE] Calling detectPrintLayoutFromImageUrl() on:", url);
console.log("[LIVE] GEMINI_API_KEY configured:", !!process.env.GEMINI_API_KEY);
console.log("[LIVE] AI_PRIMARY_MODEL:", process.env.AI_PRIMARY_MODEL || "(default gemini-3.6-flash)");
console.log("[LIVE] AI_FALLBACK_MODEL:", process.env.AI_FALLBACK_MODEL || "(default gemini-3.5-flash)\n");

const t0 = Date.now();
const result = await detectPrintLayoutFromImageUrl(url);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

if (result.error) {
  console.error(`[LIVE] ❌ FAILED after ${elapsed}s — error:`, result.error, "| status:", result.status);
  process.exit(1);
}

console.log(`[LIVE] ✅ SUCCESS after ${elapsed}s — layout:`);
console.log(JSON.stringify(result.layout, null, 2));
process.exit(0);
