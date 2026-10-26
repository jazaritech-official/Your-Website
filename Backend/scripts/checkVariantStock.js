/**
 * Diagnostic script: inspect variantStock data for a specific product.
 * Run: node scripts/checkVariantStock.js <productId>
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../Models/Product.js";

dotenv.config();

const productId = process.argv[2];
if (!productId) {
  console.error("Usage: node scripts/checkVariantStock.js <productId>");
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const product = await Product.findById(productId).lean();
  if (!product) {
    console.log("Product not found");
    process.exit(1);
  }

  console.log("=== Product ===");
  console.log("Name:", product.name);
  console.log("Stock (main):", product.stock);
  console.log("Sizes:", JSON.stringify(product.sizes));
  console.log("Colors:", JSON.stringify(product.colors));
  console.log("");

  console.log("=== variantStock ===");
  console.log("Type:", typeof product.variantStock);
  console.log("Keys:", Object.keys(product.variantStock || {}));
  console.log("Raw:", JSON.stringify(product.variantStock, null, 2));
  console.log("");

  console.log("=== variantPricing ===");
  console.log("Keys:", Object.keys(product.variantPricing || {}));
  console.log("Raw:", JSON.stringify(product.variantPricing, null, 2));
  console.log("");

  // Simulate getVariantStock for each size
  console.log("=== Simulated getVariantStock ===");
  const vs = product.variantStock || {};
  for (const size of (product.sizes || [])) {
    const key = size; // size-only key (no color)
    const val = Number(vs[key]);
    const valid = Number.isFinite(val) && val > 0;
    console.log(`  Size "${size}" → key "${key}" → vs["${key}"] = ${vs[key]} → Number = ${val} → valid = ${valid}`);
  }

  // Check all keys in variantStock with their types
  console.log("\n=== All variantStock key details ===");
  for (const [k, v] of Object.entries(vs)) {
    console.log(`  key="${k}" (type=${typeof k}) → value=${v} (type=${typeof v}) → Number=${Number(v)}`);
  }

  // Check if sizes match variantStock keys
  console.log("\n=== Size vs Key match check ===");
  for (const size of (product.sizes || [])) {
    const exactMatch = vs.hasOwnProperty(size);
    const trimmedMatch = Object.keys(vs).some(k => k.trim() === size.trim());
    const looseMatch = Object.keys(vs).some(k => k.trim().toLowerCase() === size.trim().toLowerCase());
    console.log(`  Size "${size}": exact=${exactMatch}, trimmed=${trimmedMatch}, loose=${looseMatch}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
