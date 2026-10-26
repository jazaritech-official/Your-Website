import { PushSubscription } from "../Models/PushSubscription.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import {
  sendPushToUser,
  sendPushToAll,
} from "../utils/webPush.js";

// ==========================================
// 1. SUBSCRIBE — Save a new push subscription
// ==========================================
export const subscribeUser = async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys || !keys.auth || !keys.p256dh) {
      return next(createError(400, "Invalid subscription object"));
    }

    // Attach userId if the user is authenticated (optional auth check)
    // For unauthenticated users, userId stays null (guest subscription)
    const userId = req.user?.id || null;

    // Check if subscription already exists
    const existing = await PushSubscription.findOne({ endpoint });

    if (existing) {
      // Update the keys/userId if already exists
      existing.auth = keys.auth;
      existing.p256dh = keys.p256dh;
      if (userId) existing.userId = userId;
      await existing.save();

      return res
        .status(200)
        .json(createSuccess(200, "Subscription updated successfully"));
    }

    // Create new subscription
    await PushSubscription.create({
      userId,
      endpoint,
      auth: keys.auth,
      p256dh: keys.p256dh,
    });

    return res
      .status(201)
      .json(createSuccess(201, "Subscribed successfully"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. UNSUBSCRIBE — Remove a push subscription
// ==========================================
export const unsubscribeUser = async (req, res, next) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return next(createError(400, "Endpoint is required"));
    }

    await PushSubscription.findOneAndDelete({ endpoint });

    return res
      .status(200)
      .json(createSuccess(200, "Unsubscribed successfully"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. SEND PUSH — Admin broadcast
// ==========================================
export const sendPushNotification = async (req, res, next) => {
  try {
    const { title, body, link, userId } = req.body;

    if (!title || !body) {
      return next(createError(400, "Title and body are required"));
    }

    if (userId) {
      // Send to a specific user
      await sendPushToUser(userId, { title, body, link });
      return res
        .status(200)
        .json(createSuccess(200, `Push notification sent to user ${userId}`));
    }

    // Broadcast to all subscriptions
    const sent = await sendPushToAll({ title, body, link });

    return res
      .status(200)
      .json(
        createSuccess(
          200,
          `Push broadcast sent to ${sent} subscription(s)`
        )
      );
  } catch (error) {
    next(error);
  }
};
