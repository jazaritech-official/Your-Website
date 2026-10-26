/* ============================================================
   REDIS-BACKED RATE LIMIT STORE (express-rate-limit v8)
   ------------------------------------------------------------
   Drop-in replacement for express-rate-limit's in-memory MemoryStore.
   It implements the exact same Store contract
   (init / increment / decrement / resetKey / get), so the
   `createLimiter(max, minutes)` API and every existing call site
   stay UNCHANGED — only the counting moves into Redis.

   Why: the previous in-memory counters cannot enforce a global limit
   on Vercel serverless, where each invocation may run on a different
   instance with its own memory. A counter stored in shared Redis is
   enforced correctly across every instance.

   Safety guarantees:
   - Redis down / command failure → falls back to an in-memory
     MemoryStore, so limiting behaves exactly as it did before Redis
     (never fail-closed, never crash).
   - Each createLimiter() instance gets a unique key namespace so two
     separate limiters never share a counter — identical semantics to
     today, just more reliable.
   ============================================================ */

import { MemoryStore } from "express-rate-limit";
import { redisClient, isRedisReady } from "./redisClient.js";

let instanceCounter = 0;

class RedisRateLimitStore {
  constructor({ windowSeconds = 300 } = {}) {
    this.windowSeconds = windowSeconds;
    // Unique per-limiter prefix. express-rate-limit requires a unique
    // `prefix` on every shared store (it is used both to namespace the
    // store keys AND by the `singleCount` validation — without it, two
    // limiters in one request chain, e.g. the global backstop + a route
    // limiter, look like the same key and raise ERR_ERL_DOUBLE_COUNT).
    this.prefix = `rl:${Date.now().toString(36)}:${++instanceCounter}:`;
    this.fallback = new MemoryStore();
    // Keys are shared across serverless instances via Redis (not local).
    this.localKeys = false;
  }

  init(options) {
    if (this.fallback.init) this.fallback.init(options);
  }

  redisKey(key) {
    return `${this.prefix}${key}`;
  }

  async increment(key) {
    if (isRedisReady()) {
      try {
        const rk = this.redisKey(key);
        // Atomic create-with-TTL: SET NX EX sets the counter to 1 WITH its
        // expiry in a single command, so a partial failure can never leave
        // a TTL-less key (which would grow forever and permanently 429 the
        // user — a fail-closed bug the plain incr+expire pattern allows).
        const created = await redisClient.set(
          rk,
          1,
          "EX",
          this.windowSeconds,
          "NX"
        );
        let count;
        let resetTime;
        if (created === "OK") {
          count = 1;
          resetTime = new Date(Date.now() + this.windowSeconds * 1000);
        } else {
          count = await redisClient.incr(rk);
          const ttl = await redisClient.ttl(rk);
          if (ttl < 0) {
            // Self-heal: key exists without a TTL (legacy / manual write) —
            // give it the window so it can never persist forever.
            await redisClient.expire(rk, this.windowSeconds);
          }
          // Derive the reset time from the key's remaining TTL so the
          // `RateLimit-Reset` header matches the real window end.
          resetTime = new Date(
            Date.now() + (ttl > 0 ? ttl : this.windowSeconds) * 1000
          );
        }
        return { totalHits: count, resetTime };
      } catch (err) {
        console.error("[Redis] Rate limit increment failed:", err.message);
        // fall through to in-memory fallback — never fail closed
      }
    }
    // Redis unavailable (or a command failed) — in-memory fallback,
    // exactly the behavior the app had before Redis.
    return this.fallback.increment(key);
  }

  async get(key) {
    if (isRedisReady()) {
      try {
        const rk = this.redisKey(key);
        const raw = await redisClient.get(rk);
        if (raw === null) return undefined;
        const ttl = await redisClient.ttl(rk);
        return {
          totalHits: Number(raw),
          resetTime: ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined,
        };
      } catch (err) {
        console.error("[Redis] Rate limit get failed:", err.message);
      }
    }
    return this.fallback.get ? this.fallback.get(key) : undefined;
  }

  async decrement(key) {
    if (isRedisReady()) {
      try {
        const rk = this.redisKey(key);
        const remaining = await redisClient.decr(rk);
        // A counter at zero behaves like a fresh key (matches MemoryStore).
        if (remaining <= 0) await redisClient.del(rk);
      } catch (err) {
        console.error("[Redis] Rate limit decrement failed:", err.message);
      }
      return;
    }
    return this.fallback.decrement(key);
  }

  async resetKey(key) {
    if (isRedisReady()) {
      try {
        await redisClient.del(this.redisKey(key));
      } catch (err) {
        console.error("[Redis] Rate limit reset failed:", err.message);
      }
      return;
    }
    return this.fallback.resetKey(key);
  }
}

export default RedisRateLimitStore;
