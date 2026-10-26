import express from "express";
import { verifyToken, createLimiter } from "../utils/commonFunctions.js";
import {
  getNotifications,
  getUnreadCount,
  markNotificationsAsRead,
  markSingleNotificationAsRead,
} from "../Controllers/notificationController.js";

export const notificationRoute = express.Router();

// Router-level ceiling — the navbar polls unread-count every 30s,
// so this stays comfortably above legitimate polling (≈4 req/min)
notificationRoute.use(createLimiter(120, 1));

// Protected: get all notifications for logged-in user
notificationRoute.get("/", verifyToken, getNotifications);

// Protected: get unread count
notificationRoute.get("/unread-count", verifyToken, getUnreadCount);

// Protected: mark all as read
notificationRoute.patch("/mark-as-read", verifyToken, markNotificationsAsRead);

// Protected: mark single notification as read
notificationRoute.patch(
  "/:notificationId/read",
  verifyToken,
  markSingleNotificationAsRead
);
