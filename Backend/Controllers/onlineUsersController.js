import Users from "../Models/Users.js";
import { createSuccess } from "../utils/commonFunctions.js";
import { isPusherConfigured } from "../utils/pusherHelpers.js";

const PRESENCE_TTL_SECONDS = 120; // 2 minutes — matches client heartbeat interval
const PRESENCE_KEY_PREFIX = "online:user:";

/**
 * GET /api/v1/admin/online-users (verifyAdmin)
 *
 * Reads the current online presence from Redis presence keys.
 * Each connected client periodically sets a Redis key with a TTL,
 * and this endpoint reads all keys matching the prefix to determine
 * who is currently online.
 *
 * When Pusher is not configured, falls back to an empty list
 * (presence features are disabled).
 */
export const getOnlineUsers = async (req, res, next) => {
  try {
    if (!isPusherConfigured()) {
      return res
        .status(200)
        .json(createSuccess(200, "Online users fetched", []));
    }

    // Dynamic import of Redis client to avoid circular deps
    let getRedisClient;
    try {
      const redisModule = await import("../utils/redisClient.js");
      getRedisClient = redisModule.getRedisClient || redisModule.default;
    } catch {
      // Redis not available — return empty
      return res
        .status(200)
        .json(createSuccess(200, "Online users fetched", []));
    }

    const redis = typeof getRedisClient === "function" ? getRedisClient() : getRedisClient;
    if (!redis) {
      return res
        .status(200)
        .json(createSuccess(200, "Online users fetched", []));
    }

    // Scan for all online:user:* keys
    const keys = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await redis.scan(
        cursor,
        "MATCH",
        `${PRESENCE_KEY_PREFIX}*`,
        "COUNT",
        100
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== "0");

    if (keys.length === 0) {
      return res
        .status(200)
        .json(createSuccess(200, "Online users fetched", []));
    }

    // Extract user ids from keys (format: "online:user:<userId>")
    const userIds = keys
      .map((key) => key.replace(PRESENCE_KEY_PREFIX, ""))
      .filter(Boolean);

    if (userIds.length === 0) {
      return res
        .status(200)
        .json(createSuccess(200, "Online users fetched", []));
    }

    const users = await Users.find({ _id: { $in: userIds } })
      .select("username email profilePic role")
      .lean();

    return res
      .status(200)
      .json(createSuccess(200, "Online users fetched", users));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admin/presence/heartbeat (verifyToken)
 *
 * Called by the frontend periodically to maintain online presence.
 * Sets a Redis key with a TTL so the user appears "online" as long
 * as their client is active.
 */
export const presenceHeartbeat = async (req, res, next) => {
  try {
    if (!isPusherConfigured()) {
      return res.status(200).json(createSuccess(200, "OK"));
    }

    let getRedisClient;
    try {
      const redisModule = await import("../utils/redisClient.js");
      getRedisClient = redisModule.getRedisClient || redisModule.default;
    } catch {
      return res.status(200).json(createSuccess(200, "OK"));
    }

    const redis = typeof getRedisClient === "function" ? getRedisClient() : getRedisClient;
    if (!redis) {
      return res.status(200).json(createSuccess(200, "OK"));
    }

    const userId = req.user?.id || req.user?._id;
    if (userId) {
      await redis.setex(
        `${PRESENCE_KEY_PREFIX}${userId}`,
        PRESENCE_TTL_SECONDS,
        "1"
      );
    }

    return res.status(200).json(createSuccess(200, "OK"));
  } catch (error) {
    // Non-critical — don't fail the request
    return res.status(200).json(createSuccess(200, "OK"));
  }
};
