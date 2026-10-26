import webpush from "web-push";
import { PushSubscription } from "../Models/PushSubscription.js";
import { debugLog } from "./debugLog.js";

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject =
  process.env.VAPID_SUBJECT || "mailto:ullahsibghat786@gmail.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn(
    "[WebPush] VAPID keys not configured. Push notifications will not work."
  );
}

/**
 * Build the standardized push payload.
 */
function buildPayload({ title, body, link }) {
  return JSON.stringify({
    title: title || "Notification",
    body: body || "",
    link: link || "/",
    icon: "/icons/icon-192x192-maskable.png",
    badge: "/icons/icon-192x192.png",
  });
}

/**
 * Send a push notification to a list of subscription documents.
 * Automatically removes subscriptions that return 404/410 (expired/invalid).
 *
 * @param {Array} subscriptions - Array of PushSubscription docs
 * @param {string} payloadJSON - JSON string payload
 * @returns {Promise<number>} Number of successfully sent notifications
 */
async function sendToSubscriptions(subscriptions, payloadJSON) {
  let sent = 0;
  const prunePromises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh,
          },
        },
        payloadJSON
      );
      sent++;
    } catch (err) {
      // Remove expired/invalid subscriptions (410 Gone / 404 Not Found)
      if (err.statusCode === 410 || err.statusCode === 404) {
        debugLog(
          `[WebPush] Removing expired subscription: ${sub.endpoint.slice(0, 50)}...`
        );
        await PushSubscription.findByIdAndDelete(sub._id);
      } else {
        console.error(
          `[WebPush] Error sending to ${sub.endpoint.slice(0, 50)}...:`,
          err.message || err
        );
      }
    }
  });

  await Promise.allSettled(prunePromises);
  return sent;
}

/**
 * Send a push notification to all subscriptions belonging to one or more users.
 *
 * @param {string|string[]|ObjectId[]} userId - A user's ObjectId, or an array of them
 * @param {object} data - { title, body, link }
 * @returns {Promise<number>} Number of successfully sent notifications
 */
export const sendPushToUser = async (userId, { title, body, link }) => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[WebPush] VAPID keys missing, cannot send push.");
    return 0;
  }

  if (!userId || (Array.isArray(userId) && userId.length === 0)) {
    console.warn("[WebPush] No userId provided, skipping push.");
    return 0;
  }

  try {
    const ids = Array.isArray(userId) ? userId : [userId];
    const subscriptions = await PushSubscription.find({ userId: { $in: ids } });

    if (subscriptions.length === 0) {
      return 0;
    }

    const payload = buildPayload({ title, body, link });
    return await sendToSubscriptions(subscriptions, payload);
  } catch (error) {
    console.error("[WebPush] sendPushToUser error:", error.message || error);
    return 0;
  }
};

/**
 * Send a push notification to ALL subscriptions in the database.
 *
 * @param {object} data - { title, body, link }
 * @returns {Promise<number>} Number of successfully sent notifications
 */
export const sendPushToAll = async ({ title, body, link }) => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[WebPush] VAPID keys missing, cannot send push.");
    return 0;
  }

  try {
    const allSubscriptions = await PushSubscription.find({});
    if (allSubscriptions.length === 0) return 0;

    const payload = buildPayload({ title, body, link });
    const sent = await sendToSubscriptions(allSubscriptions, payload);
    return sent;
  } catch (error) {
    console.error("[WebPush] sendPushToAll error:", error.message || error);
    return 0;
  }
};

/**
 * Send a push notification to all users with role "rider".
 * Marketplace job notifications are best-effort: riders without a push
 * subscription are simply skipped — delivery must never throw.
 *
 * @param {object} data - { title, body, link }
 * @returns {Promise<number>} Number of successfully sent notifications
 */
export const sendPushToRiders = async ({ title, body, link }) => {
  try {
    const { default: Users } = await import("../Models/Users.js");
    const riders = await Users.find({ role: "rider" }).select("_id").lean();
    if (riders.length === 0) return 0;
    const riderIds = riders.map((r) => r._id.toString());
    return await sendPushToUser(riderIds, { title, body, link });
  } catch (error) {
    console.error("[WebPush] sendPushToRiders error:", error.message || error);
    return 0;
  }
};
