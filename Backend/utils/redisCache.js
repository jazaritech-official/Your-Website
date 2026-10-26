/* ============================================================
   SAFE REDIS CACHE WRAPPERS
   ------------------------------------------------------------
   Best-effort caching helpers that NEVER throw and NEVER block the
   app. Every caller must keep working identically when Redis is
   slow, unreachable, or misconfigured: a failed read behaves like
   a cache miss (caller proceeds to the DB), a failed write is
   swallowed (the live response is unaffected).

   ioredis stores/returns strings only, so objects are explicitly
   JSON-stringified on write and parsed on read (unlike
   @upstash/redis, which does this automatically).
   ============================================================ */

import { redisClient, isRedisReady } from "./redisClient.js";

// Upper bound for a single cached value — Upstash caps payload size
// (~1MB). Anything larger is simply not cached (caching is best-effort).
const MAX_VALUE_BYTES = 800 * 1024;

/** Best-effort read. Returns null on any Redis issue → caller hits the DB. */
export async function safeGet(key) {
  if (!isRedisReady()) return null;
  try {
    const raw = await redisClient.get(key);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // value wasn't JSON — return as-is (plain string)
    }
  } catch (err) {
    console.error(`[Redis] GET failed for key "${key}":`, err.message);
    return null; // fall back to "cache miss" — caller proceeds to DB
  }
}

/** Best-effort write. Never throws — a failed cache write must not affect the response. */
export async function safeSet(key, value, ttlSeconds) {
  if (!isRedisReady()) return;
  try {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    if (serialized === undefined) return;
    if (Buffer.byteLength(serialized, "utf8") > MAX_VALUE_BYTES) {
      // Oversized value — skip (Upstash rejects values above ~1MB and
      // the safeSet error log would just be noise).
      return;
    }
    await redisClient.set(key, serialized, "EX", ttlSeconds);
  } catch (err) {
    console.error(`[Redis] SET failed for key "${key}":`, err.message);
    // swallow — caching is best-effort, never let a cache-write failure
    // affect the actual response to the user
  }
}

/** Best-effort delete. */
export async function safeDel(key) {
  if (!isRedisReady()) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`[Redis] DEL failed for key "${key}":`, err.message);
  }
}

/**
 * Delete every key matching a glob pattern using scanStream (never the
 * blocking KEYS command, which can stall Redis on larger datasets).
 * Used to invalidate whole cache families (e.g. "products:list:*")
 * after a write, since tracking every individual key is impractical.
 */
export async function invalidateByPattern(pattern) {
  if (!isRedisReady()) return;
  try {
    const stream = redisClient.scanStream({ match: pattern, count: 100 });
    const keysToDelete = [];
    await new Promise((resolve, reject) => {
      stream.on("data", (keys) => keysToDelete.push(...keys));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    if (keysToDelete.length) {
      await redisClient.del(...keysToDelete);
    }
  } catch (err) {
    console.error(
      `[Redis] Pattern invalidation failed for "${pattern}":`,
      err.message
    );
  }
}

/** Invalidate every cached product listing / search-suggestion key. */
export const invalidateProductListings = () =>
  invalidateByPattern("products:list:*");

/** Invalidate the cached getAllCategories payload (categories:all). */
export const invalidateCategoriesCache = () =>
  safeDel("categories:all");

/** Invalidate the cached getProductById payload for a single product. */
export const invalidateProductDetail = (productId) => {
  if (!productId) return Promise.resolve();
  return safeDel(`products:detail:${productId}`);
};

/**
 * Invalidate cached related-product lists that reference this product.
 * F-007: related products are cached per product+limit key; after a
 * mutation we clear all related caches to avoid serving stale results.
 * Uses pattern scan (not KEYS) so it's safe in production.
 */
export const invalidateRelatedProductsCache = () =>
  invalidateByPattern("products:related:*");
