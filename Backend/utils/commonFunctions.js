import dotenv from "dotenv";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import mongoose from "mongoose";
import { debugLog } from "./debugLog.js";
import RedisRateLimitStore from "./redisRateLimitStore.js";
dotenv.config();
import jwt from "jsonwebtoken";
import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

export const createError = (status, message, code) => {
  const err = new Error();
  err.status = status;
  err.message = message;
  if (code) err.code = code;
  return err;
};
export const createSuccess = (status, message, data = {}) => {
  const successObj = {};
  successObj.status = status;
  successObj.message = message;
  successObj.data = data;
  return successObj;
};
// ==================== ROLE RESOLVER ====================
// Admin status comes from the `role` field on the User document,
// which is auto-assigned based on SUPER_ADMIN_EMAIL / ADMIN_EMAILS
// env vars at signup / login.
// Resolve the effective role for a user.
// SUPER_ADMIN_EMAIL / ADMIN_EMAILS env vars always take precedence
// so admin emails can be managed from .env without touching the DB.
// If the email does not match any .env entry, the DB-stored role is returned.
export const resolveRole = (email, dbRole) => {
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const riderEmails = (process.env.RIDER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const e = (email || "").trim().toLowerCase();
  // Env-admin check takes precedence over DB role
  if (e === superAdminEmail) return "superadmin";
  if (adminEmails.includes(e)) return "admin";
  // Env-rider check takes precedence over a plain DB "user" role
  if (riderEmails.includes(e)) return "rider";
  // Fall back to DB role (or default "user")
  return dbRole || "user";
};

export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) return next(createError(401, "You are not authenticated!", "AUTH_REQUIRED"));

    jwt.verify(token, process.env.JWT, async (err, user) => {
      if (err) {
        const code = err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
        return next(createError(403, "Token is not valid!", code));
      }
      req.user = user;
      try {
        const Users = (await import("../Models/Users.js")).default;
        // ── Optimized: check Redis cache first (5s TTL) to avoid a DB
        // round-trip on every authenticated request. The cached value is
        // small (email, role, tokenVersion) and expires quickly so role
        // changes / token invalidation propagate within seconds.
        let dbUser = null;
        let cacheHit = false;
        try {
          const { redisClient, isRedisReady } = await import("./redisClient.js");
          if (isRedisReady()) {
            const cacheKey = `auth:user:${user.id}`;
            const cached = await redisClient.get(cacheKey);
            if (cached) {
              dbUser = JSON.parse(cached);
              cacheHit = true;
            }
          }
        } catch { /* Redis unavailable — fall through to DB */ }

        if (!dbUser) {
          dbUser = await Users.findById(user.id).select("email role tokenVersion").lean();
          // Cache the result for 5 seconds (best-effort)
          try {
            const { redisClient, isRedisReady } = await import("./redisClient.js");
            if (isRedisReady() && dbUser) {
              const cacheKey = `auth:user:${user.id}`;
              await redisClient.set(cacheKey, JSON.stringify(dbUser), "EX", 5);
            }
          } catch { /* swallow — cache write failure must not affect auth */ }
        }

        if (dbUser) {
          req.user.email = dbUser.email;
          req.user.role = resolveRole(dbUser.email, dbUser.role);
          const dbTokenVersion = dbUser.tokenVersion ?? 0;
          if (user.tokenVersion !== undefined && dbTokenVersion !== user.tokenVersion) {
            // Invalidate the cache so a re-login immediately works
            try {
              const { redisClient, isRedisReady } = await import("./redisClient.js");
              if (isRedisReady()) {
                await redisClient.del(`auth:user:${user.id}`);
              }
            } catch { /* swallow */ }
            return next(createError(401, "Session expired, please log in again", "SESSION_INVALIDATED"));
          }
        } else {
          req.user.role = "user";
        }
      } catch {
        req.user.role = "user";
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};

export const verifyUser = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return next(err);
    // If no :id param is present, just verify the user is authenticated
    // If :id is present, it must match the user's own ID (or be admin)
    if (
      !req.params.id ||
      req.user.id === req.params.id ||
      req.user.isAdmin ||
      req.user.role === "superadmin" ||
      req.user.role === "admin"
    ) {
      next();
    } else {
      next(createError(401, "You are not authorized"));
    }
  });
};

export const verifyAdmin = (req, res, next) => {
  // If verifyToken already ran (req.user already resolved), just check role.
  // This avoids a redundant DB query on routes with `verifyToken, verifyAdmin`.
  if (req.user && (req.user.role === "superadmin" || req.user.role === "admin" || req.user.isAdmin)) {
    return next();
  }
  // If req.user is not set (verifyToken wasn't called first), run verifyToken
  // to ensure the user is authenticated before checking admin status.
  if (!req.user) {
    verifyToken(req, res, (err) => {
      if (err) return next(err);
      if (req.user.role === "superadmin" || req.user.role === "admin" || req.user.isAdmin) {
        next();
      } else {
        next(createError(401, "You are not authorized"));
      }
    });
    return;
  }
  next(createError(401, "You are not authorized"));
};

/* ==================== THEME REVALIDATE TICKETS ====================
 * The storefront's on-demand revalidation endpoint lives on the FRONTEND
 * origin, but the admin session cookie is host-only to the BACKEND origin and
 * the two production hosts are different registrable domains — so the
 * browser can never present that cookie to the frontend route. The purge then
 * silently never ran (see Frontend/src/app/api/theme/revalidate/route.ts).
 *
 * A successful theme WRITE therefore mints a short-lived, single-purpose
 * ticket that the Admin's browser hands back to the frontend route. The
 * frontend cannot verify it itself (it holds no signing key), so it exchanges
 * it here.
 *
 * The ticket is signed with `process.env.JWT` PLUS a fixed suffix. That means
 * it can NEVER be replayed as a normal `Authorization: Bearer` access token
 * (verifyToken() uses the bare `JWT` key), it carries no session data beyond
 * an identity + scope, and it expires in 5 minutes. No new env var is needed.
 */
const THEME_REVALIDATE_SECRET = `${process.env.JWT}:theme-revalidate`;

export const signThemeRevalidateTicket = (user) =>
  jwt.sign(
    {
      scope: "theme:revalidate",
      id: user?.id || user?._id || null,
      role: user?.role || null,
      tokenVersion: user?.tokenVersion ?? null,
    },
    THEME_REVALIDATE_SECRET,
    { expiresIn: "5m" }
  );

export const verifyThemeRevalidateTicket = (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      return next(
        createError(401, "Revalidation ticket is required", "AUTH_REQUIRED")
      );
    }
    jwt.verify(token, THEME_REVALIDATE_SECRET, (err, payload) => {
      if (err || payload?.scope !== "theme:revalidate") {
        return next(
          createError(403, "Revalidation ticket is not valid", "TOKEN_INVALID")
        );
      }
      req.revalidateTicket = payload;
      next();
    });
  } catch (error) {
    next(error);
  }
};

/* ==================== SHOWCASE REVALIDATE TICKETS ====================
 * Same design as the theme ticket above, but with its OWN derived secret
 * and scope. The showcase purge is server-to-server: the BACKEND triggers
 * the frontend's /api/showcase/revalidate route after publish/archive/
 * unarchive, sending this ticket; the frontend route holds no signing key
 * and exchanges it at POST /brand-profiles/revalidate/authorize.
 *
 * Separate secret + scope means a showcase ticket can never be replayed as
 * a theme ticket, a theme ticket can never purge showcase tags, and neither
 * can ever be replayed as an access token (verifyToken uses the bare JWT
 * key). TTL is 5 minutes — long enough for one server-to-server call.
 */
const SHOWCASE_REVALIDATE_SECRET = `${process.env.JWT}:showcase-revalidate`;

export const signShowcaseRevalidateTicket = (user) =>
  jwt.sign(
    {
      scope: "showcase:revalidate",
      id: user?.id || user?._id || null,
      role: user?.role || null,
    },
    SHOWCASE_REVALIDATE_SECRET,
    { expiresIn: "5m" }
  );

export const verifyShowcaseRevalidateTicket = (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      return next(
        createError(401, "Revalidation ticket is required", "AUTH_REQUIRED")
      );
    }
    jwt.verify(token, SHOWCASE_REVALIDATE_SECRET, (err, payload) => {
      if (err || payload?.scope !== "showcase:revalidate") {
        return next(
          createError(403, "Revalidation ticket is not valid", "TOKEN_INVALID")
        );
      }
      req.revalidateTicket = payload;
      next();
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pure role-gate decision for the superadmin tier (F-14). Exported so the
 * gate itself is unit-testable without standing up the full auth chain.
 * The middleware below is the ONLY gate that admits callers to Jazari Tech
 * internal tooling (Showcase Studio, Pitch Records); `verifyToken` re-resolves
 * the role from the database, so a stale JWT claim can never elevate it.
 */
export const isSuperAdmin = (user) => user?.role === "superadmin";

export const requireSuperAdmin = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return next(err);
    if (isSuperAdmin(req.user)) {
      next();
    } else {
      next(createError(403, "Super admin access required"));
    }
  });
};

export const requireAdminOrAbove = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return next(err);
    if (req.user.role === "superadmin" || req.user.role === "admin") {
      next();
    } else {
      next(createError(403, "Admin access required"));
    }
  });
};

export const verifyRider = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return next(err);
    if (req.user.role === "rider") {
      next();
    } else {
      next(createError(403, "Rider access required"));
    }
  });
};

export const verifyAdminOrRider = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return next(err);
    if (
      req.user.role === "superadmin" ||
      req.user.role === "admin" ||
      req.user.role === "rider"
    ) {
      next();
    } else {
      next(createError(403, "Access restricted to admins and riders"));
    }
  });
};

export const connectDB = async () => {
  const cached = global.mongoose || {};
  if (!global.mongoose) global.mongoose = cached;
  if (cached.conn) {
    debugLog("[PERF] MongoDB: reusing cached connection");
    return cached.conn;
  }

  if (!cached.promise) {
    debugLog("[PERF] MongoDB: creating NEW connection");
    const MONGO = process.env.MONGO;
    if (!MONGO) throw createError(500, "MongoDB URI not found in env");

    mongoose.set("strictQuery", false);

    cached.promise = mongoose
      .connect(MONGO, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
      })
      .then((mongooseInstance) => {
        mongoose.connection.on("disconnected", () => {
          console.warn("⚠️ MongoDB disconnected, attempting to reconnect...");
        });
        mongoose.connection.on("reconnected", () => {
          debugLog("✅ MongoDB reconnected");
        });
        mongoose.connection.on("error", (err) => {
          console.error("MongoDB connection error:", err.message);
        });
        debugLog("✅ New DB Connected");
        debugLog(`[PERF] MongoDB connection established (readyState=${mongoose.connection.readyState})`);
        return mongooseInstance;
      })
      .catch((err) => {
        console.error("MongoDB initial connection error:", err.message);
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
};

/**
 * Invalidate the cached auth metadata for a user so the next request
 * re-reads from the DB. Call this after role changes, password changes,
 * token version increments, or account disabling.
 */
export async function invalidateAuthCache(userId) {
  if (!userId) return;
  try {
    const { redisClient, isRedisReady } = await import("./redisClient.js");
    if (isRedisReady()) {
      await redisClient.del(`auth:user:${userId}`);
    }
  } catch { /* swallow — cache invalidation failure must not affect the business action */ }
}

/**
 * Rate-limit key for admin routes (F-12): the authenticated user id when
 * available (auth middleware runs BEFORE these limiters), otherwise a
 * normalized client IP. Uses express-rate-limit's own ipKeyGenerator for
 * the IP fallback so IPv6 subnets are grouped correctly.
 */
export const userOrIpKey = (req) =>
  req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip);

export const createLimiter = (maxRequests, timeInMinutes = 5, extraOptions = {}) => {
  return rateLimit({
    windowMs: timeInMinutes * 60 * 1000,
    max: maxRequests, // Yeh aapke diye gaye 'maxRequests' ke hisaab se chalega
    message: {
      status: 429,
      error: `Limit exceeded. Max ${maxRequests} requests allowed per ${timeInMinutes} minutes.`,
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Redis-backed counting (utils/redisRateLimitStore.js) — same limits
    // as before, but now enforced across serverless instances since the
    // counter lives in shared Redis. Falls back to in-memory counting
    // (identical pre-Redis behavior) whenever Redis is unavailable.
    store: new RedisRateLimitStore({ windowSeconds: timeInMinutes * 60 }),
    // Optional overrides (e.g. { skip: (req) => boolean }) for the global limiter
    ...extraOptions,
  });
};

export const createSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, "and") // & → and
    .replace(/[^a-z0-9\s-]/g, "") // special characters remove
    .replace(/\s+/g, "-") // spaces → dash
    .replace(/-+/g, "-"); // multiple dashes → single dash
};
