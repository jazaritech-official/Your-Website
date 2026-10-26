/* ============================================================
   REDIS CLIENT (Upstash) — centralized, fail-safe, connection-reused
   ------------------------------------------------------------
   Purely additive infrastructure. Redis is a CACHING/PERFORMANCE
   layer only — the app must run completely normally (direct DB
   queries, in-memory rate limiting) even when Redis is unreachable
   or misconfigured.

   The client instance is cached on `global` so warm serverless
   invocations reuse the same TCP connection instead of reconnecting
   on every request — the same technique this project already uses
   for MongoDB in utils/commonFunctions.js (`global.mongoose`).
   ============================================================ */

import Redis from "ioredis";
import dotenv from "dotenv";
import { debugLog } from "./debugLog.js";

// Load .env HERE, not just in index.js/commonFunctions.js: ESM evaluates
// this module during commonFunctions' import phase (via
// redisRateLimitStore.js), which runs BEFORE any dotenv.config() statement
// in the importing module. Idempotent — existing env vars are never
// overwritten, and other modules already call it too.
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

let redisClient = global._redisClient || null;

if (!redisClient && REDIS_URL) {
  debugLog("[PERF] Redis: creating NEW connection");
  try {
    redisClient = new Redis(REDIS_URL, {
      // Fail fast instead of hanging: never queue commands while
      // disconnected so safeGet/safeSet/rate-limit can fall back.
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      enableOfflineQueue: false,
      // Give up reconnecting after a handful of attempts so a dead
      // instance never keeps retry timers alive in a serverless
      // function (a fresh cold start simply tries again).
      retryStrategy: (times) =>
        times > 5 ? null : Math.min(times * 200, 2000),
      // Upstash uses rediss:// (TLS). ioredis auto-detects this from
      // the connection-string scheme; the explicit flag documents it.
      tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });
    redisClient.on("ready", () => {
      debugLog("[Redis] Connected and ready.");
      debugLog("[PERF] Redis: connection ready");
    });

    global._redisClient = redisClient;
  } catch (err) {
    console.error("[Redis] Failed to initialize client:", err.message);
    redisClient = null;
  }
} else if (redisClient) {
  debugLog("[PERF] Redis: reusing cached connection (status=" + redisClient.status + ")");
} else if (!REDIS_URL) {
  console.warn(
    "[Redis] REDIS_URL not set — caching disabled, app will run without Redis."
  );
}

/**
 * True only when the shared client is currently usable.
 * Read fresh on every call so a dropped connection is detected
 * immediately (and a recovered one is reused).
 */
export const isRedisReady = () =>
  redisClient && redisClient.status === "ready";

export { redisClient };
