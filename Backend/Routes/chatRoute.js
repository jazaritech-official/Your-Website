import express from "express";import { verifyToken, verifyAdmin, requireSuperAdmin, createLimiter, } from "../utils/commonFunctions.js";
import { uploadChatImage } from "../utils/cloudinary.js";
import {
  getConversations,
  getConversationById,
  getMessages,
  sendMessage,
  sendImageMessage,
  markAsRead,
  getUnreadCount,
  getOrCreateByProduct,
  getOrCreateByOrder,
  startDirectConversation,
  deleteConversation,
  bulkDeleteConversations,
  sendTypingIndicator,
} from "../Controllers/chatController.js";

export const chatRoute = express.Router();

// Router-level ceiling for all chat traffic (polling, list fetches, etc.)
chatRoute.use(createLimiter(120, 1));

// All chat routes require authentication
// Per-route limiters: 60 fetches/min for list/detail reads, 30 msgs/min for sends
chatRoute.get("/conversations", verifyToken, createLimiter(60, 1), getConversations);
chatRoute.get("/conversations/unread-count", verifyToken, createLimiter(60, 1), getUnreadCount);
chatRoute.get("/conversations/product/:productId", verifyToken, createLimiter(60, 1), getOrCreateByProduct);
chatRoute.get("/conversations/order/:orderId", verifyToken, createLimiter(60, 1), getOrCreateByOrder);
chatRoute.get("/conversations/:conversationId", verifyToken, createLimiter(60, 1), getConversationById);
chatRoute.get("/conversations/:conversationId/messages", verifyToken, createLimiter(60, 1), getMessages);
chatRoute.post("/messages", verifyToken, createLimiter(30, 1), sendMessage);
chatRoute.post("/messages/image", verifyToken, createLimiter(20, 1), uploadChatImage.single("file"), sendImageMessage);
chatRoute.patch("/conversations/:conversationId/read", verifyToken, markAsRead);
chatRoute.post("/typing", verifyToken, createLimiter(60, 1), sendTypingIndicator);

// ── Admin-initiated direct conversation (Online Users page) ──
chatRoute.post("/start-direct", verifyAdmin, startDirectConversation);

// ── Conversation deletion — SUPERADMIN only ──
// NOTE: /conversations/bulk MUST be registered BEFORE /conversations/:conversationId
// so that "bulk" is matched as the literal bulk route and not captured as a conversation id.
chatRoute.delete("/conversations/bulk", requireSuperAdmin, bulkDeleteConversations);
chatRoute.delete("/conversations/:conversationId", requireSuperAdmin, deleteConversation);
