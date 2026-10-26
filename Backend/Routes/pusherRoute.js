import express from "express";
import { verifyToken, createLimiter } from "../utils/commonFunctions.js";
import {
  isPusherConfigured,
  getPusherClientConfig,
} from "../utils/pusherHelpers.js";
import Users from "../Models/Users.js";
import dotenv from "dotenv";

dotenv.config();

export const pusherRoute = express.Router();

/**
 * POST /api/v1/pusher/auth
 *
 * Pusher client authentication endpoint.
 * The frontend sends its socket_id here; the server signs it with the
 * secret and returns the auth signature. This is the standard Pusher
 * authentication pattern — the secret key never leaves the server.
 *
 * Request: { socket_id: string, channel_name: string }
 * Response: { auth: string }
 */
pusherRoute.post(
  "/auth",
  verifyToken,
  createLimiter(60, 1),
  async (req, res) => {
    try {
      if (!isPusherConfigured()) {
        return res.status(503).json({
          success: false,
          message: "Pusher is not configured on this server",
        });
      }

      const { socket_id, channel_name } = req.body;

      if (!socket_id || !channel_name) {
        return res.status(400).json({
          success: false,
          message: "socket_id and channel_name are required",
        });
      }

      const Pusher = (await import("pusher")).default;
      const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER || "ap2",
        useTLS: true,
      });

      // For presence channels, include user identity as channel_data.
      // Pusher requires this so the channel can maintain a member list
      // with user_id and user_info for each connected client.
      // The JWT only contains { id, role } — we must look up the full
      // profile from the DB so the Online Users page can display names,
      // emails, and avatars without a secondary fetch.
      if (channel_name.startsWith("presence-")) {
        const userId = req.user?.id || req.user?._id;

        // Look up the full user profile (single indexed query, fast)
        let userName = "Unknown";
        let userRole = req.user?.role || "user";
        let userEmail = "";
        let userPic = "";
        try {
          const user = await Users.findById(userId)
            .select("username email profilePic role")
            .lean();
          if (user) {
            userName = user.username || user.email?.split("@")[0] || "Unknown";
            userRole = user.role || userRole;
            userEmail = user.email || "";
            userPic = user.profilePic || "";
          }
        } catch {
          // Fallback to JWT values if DB lookup fails
          userName = req.user?.username || req.user?.name || "Unknown";
        }

        const auth = pusher.authenticate(socket_id, channel_name, {
          user_id: String(userId),
          user_info: {
            name: userName,
            role: userRole,
            email: userEmail,
            profilePic: userPic,
          },
        });

        return res.status(200).json({ success: true, data: auth });
      }

      // Private channels — standard auth without channel_data
      const auth = pusher.authenticate(socket_id, channel_name);

      return res.status(200).json({ success: true, data: auth });
    } catch (err) {
      console.error("[Pusher] Auth error:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to authenticate Pusher channel",
      });
    }
  }
);

/**
 * GET /api/v1/pusher/config
 *
 * Returns the public Pusher key and cluster for the frontend SDK.
 * This does NOT expose the secret — only the public key needed to connect.
 */
pusherRoute.get("/config", verifyToken, (req, res) => {
  if (!isPusherConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Pusher is not configured",
    });
  }

  const config = getPusherClientConfig();
  return res.status(200).json({
    success: true,
    data: {
      key: config.key,
      cluster: config.cluster,
    },
  });
});
