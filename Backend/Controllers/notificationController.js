import { Notification } from "../Models/Notification.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";

// ==========================================
// 1. GET USER NOTIFICATIONS (newest first)
// ==========================================
export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ userId });
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    return res.status(200).json(
      createSuccess(200, "Notifications fetched successfully", {
        notifications,
        total,
        unreadCount,
        page,
        totalPages: Math.ceil(total / limit),
      })
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. GET UNREAD COUNT
// ==========================================
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    return res
      .status(200)
      .json(createSuccess(200, "Unread count fetched", { unreadCount }));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. MARK ALL AS READ
// ==========================================
export const markNotificationsAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res
      .status(200)
      .json(createSuccess(200, "Notifications marked as read"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. MARK SINGLE NOTIFICATION AS READ
// ==========================================
export const markSingleNotificationAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return next(createError(404, "Notification not found"));
    }

    return res
      .status(200)
      .json(createSuccess(200, "Notification marked as read", notification));
  } catch (error) {
    next(error);
  }
};
