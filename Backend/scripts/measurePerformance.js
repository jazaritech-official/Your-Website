/**
 * Phase 0 Measurement Script
 * Run: node scripts/measurePerformance.js
 * 
 * This script measures:
 * 1. MongoDB connection timing (cold vs warm)
 * 2. Product search query execution stats (.explain)
 * 3. DNS lookup time with/without override
 * 4. Redis connection timing
 */

import mongoose from "mongoose";
import dns from "dns";
import dotenv from "dotenv";

dotenv.config();

const MONGO = process.env.MONGO;
if (!MONGO) {
  console.error("MONGO env var not set");
  process.exit(1);
}

// ============================================================
// 1. MongoDB Connection Timing
// ============================================================
console.log("\n=== MongoDB Connection Timing ===");

const mongoColdStart = Date.now();
await mongoose.connect(MONGO, {
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
});
console.log(`Cold connection: ${Date.now() - mongoColdStart}ms`);

// Warm connection (should reuse)
const mongoWarmStart = Date.now();
await mongoose.connect(MONGO);
console.log(`Warm connection (reuse): ${Date.now() - mongoWarmStart}ms`);
console.log(`Connection readyState: ${mongoose.connection.readyState}`);

// ============================================================
// 2. Product Search Query .explain()
// ============================================================
console.log("\n=== Product Search Query Execution Stats ===");

const Product = mongoose.model("Product", new mongoose.Schema({}, { strict: false }));

// Test 1: $regex search (current behavior)
const regexFilter = {
  $or: [
    { name: { $regex: "shirt", $options: "i" } },
    { description: { $regex: "shirt", $options: "i" } },
    { tags: { $in: [new RegExp("shirt", "i")] } },
  ],
};

try {
  const regexExplain = await Product.find(regexFilter)
    .explain("executionStats");
  
  const regexStats = regexExplain.executionStats || regexExplain[0]?.executionStats;
  console.log("\n$regex search for 'shirt':");
  console.log(`  totalDocsExamined: ${regexStats?.totalDocsExamined}`);
  console.log(`  totalKeysExamined: ${regexStats?.totalKeysExamined}`);
  console.log(`  executionTimeMillis: ${regexStats?.executionTimeMillis}`);
  console.log(`  nReturned: ${regexStats?.nReturned}`);
  console.log(`  executionStages: ${regexStats?.executionStages?.stage}`);
} catch (err) {
  console.log(`$regex explain failed: ${err.message}`);
}

// Test 2: $text search (potential replacement)
try {
  const textExplain = await Product.find(
    { $text: { $search: "shirt" } },
    { score: { $meta: "textScore" } }
  ).explain("executionStats");
  
  const textStats = textExplain.executionStats || textExplain[0]?.executionStats;
  console.log("\n$text search for 'shirt':");
  console.log(`  totalDocsExamined: ${textStats?.totalDocsExamined}`);
  console.log(`  totalKeysExamined: ${textStats?.totalKeysExamined}`);
  console.log(`  executionTimeMillis: ${textStats?.executionTimeMillis}`);
  console.log(`  nReturned: ${textStats?.nReturned}`);
  console.log(`  executionStages: ${textStats?.executionStages?.stage}`);
} catch (err) {
  console.log(`$text explain failed: ${err.message}`);
}

// Test 3: Count documents
const countStart = Date.now();
const totalCount = await Product.countDocuments();
console.log(`\nProduct count: ${totalCount} (${Date.now() - countStart}ms)`);

// ============================================================
// 3. DNS Lookup Timing
// ============================================================
console.log("\n=== DNS Lookup Timing ===");

const dnsTestHost = "cloudinary.com";

// Test with default DNS
const dnsDefaultStart = Date.now();
await new Promise((resolve, reject) => {
  dns.lookup(dnsTestHost, (err) => {
    if (err) reject(err);
    else resolve();
  });
});
console.log(`Default DNS lookup for ${dnsTestHost}: ${Date.now() - dnsDefaultStart}ms`);

// Test with Google DNS override (as currently configured)
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const dnsGoogleStart = Date.now();
await new Promise((resolve, reject) => {
  dns.lookup(dnsTestHost, (err) => {
    if (err) reject(err);
    else resolve();
  });
});
console.log(`Google DNS lookup for ${dnsTestHost}: ${Date.now() - dnsGoogleStart}ms`);

// Reset to default
dns.setServers([]);

// ============================================================
// 4. Redis Connection Timing
// ============================================================
console.log("\n=== Redis Connection Timing ===");

try {
  const { default: Redis } = await import("ioredis");
  const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  
  if (REDIS_URL) {
    const redisColdStart = Date.now();
    const redis = new Redis(REDIS_URL, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await redis.connect();
    console.log(`Redis cold connect: ${Date.now() - redisColdStart}ms`);
    
    // Round-trip test
    const rtStart = Date.now();
    await redis.set("perf:test", "ok", "EX", 10);
    await redis.get("perf:test");
    await redis.del("perf:test");
    console.log(`Redis round-trip (set+get+del): ${Date.now() - rtStart}ms`);
    
    await redis.quit();
  } else {
    console.log("REDIS_URL not set — skipping Redis timing");
  }
} catch (err) {
  console.log(`Redis timing failed: ${err.message}`);
}

// ============================================================
// Cleanup
// ============================================================
await mongoose.disconnect();
console.log("\n=== Measurement Complete ===");
