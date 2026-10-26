import Pusher from "pusher";
import dotenv from "dotenv";

dotenv.config();

const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
const PUSHER_KEY = process.env.PUSHER_KEY;
const PUSHER_SECRET = process.env.PUSHER_SECRET;
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || "ap2";

let pusherInstance = null;

/**
 * Get or create the singleton Pusher instance.
 * Returns null if Pusher credentials are not configured.
 */
function getPusher() {
  if (pusherInstance) return pusherInstance;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) {
    console.warn(
      "[Pusher] PUSHER_APP_ID / PUSHER_KEY / PUSHER_SECRET not set — realtime disabled"
    );
    return null;
  }
  try {
    pusherInstance = new Pusher({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER,
      useTLS: true,
    });
    return pusherInstance;
  } catch (err) {
    console.error("[Pusher] Failed to create Pusher instance:", err.message);
    return null;
  }
}

/**
 * Check if Pusher is properly configured.
 */
export function isPusherConfigured() {
  return !!(PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET);
}

/**
 * Get the public Pusher key and cluster for the frontend.
 */
export function getPusherClientConfig() {
  return { key: PUSHER_KEY, cluster: PUSHER_CLUSTER };
}

/**
 * Trigger an event on one or more Pusher channels.
 *
 * @param {string|string[]} channels - Channel name(s) to trigger on
 * @param {string} event - Event name (topic)
 * @param {object} payload - Event data
 * @returns {Promise<boolean>} true if published, false if failed/unavailable
 */
export async function triggerChannel(channels, event, payload) {
  const pusher = getPusher();
  if (!pusher) return false;

  try {
    const channelList = Array.isArray(channels) ? channels : [channels];
    await pusher.trigger(channelList, event, { event, data: payload });
    return true;
  } catch (err) {
    console.error(`[Pusher] Trigger error (${event}):`, err.message);
    return false;
  }
}

/**
 * Publish a real-time event to one or more users' personal channels.
 * Convenience wrapper around triggerChannel for common patterns.
 *
 * Channel naming convention (same as Pusher channel naming):
 *   - users  → "private-user-<userId>"
 *   - admins → "private-admin-<adminId>"
 *
 * @param {string|string[]} userIds - User id(s) to publish to
 * @param {string} topic - Event topic (e.g. "new_message", "tracking:status")
 * @param {object} payload - Event data
 * @returns {Promise<Array>} Results of each publish attempt
 */
export async function publishToUsers(userIds, topic, payload) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const channels = ids.map((id) => `private-user-${id}`);
  return triggerChannel(channels, topic, payload);
}

/**
 * Publish a real-time event to the admin-presence channel.
 * Used for admin tracking dashboard updates.
 *
 * @param {string} topic - Event topic
 * @param {object} payload - Event data
 * @returns {Promise<boolean>}
 */
export async function publishToAdmins(topic, payload) {
  return triggerChannel("presence-admin-presence", topic, payload);
}

/**
 * Publish a real-time event to all users with role === "rider".
 * Looks up all rider user IDs and publishes to each rider's personal room.
 * Used for marketplace job broadcasts (new available delivery jobs).
 *
 * @param {string} topic - Event topic (e.g. "marketplace:new_job")
 * @param {object} payload - Event data
 * @returns {Promise<boolean>} true if published to at least one rider
 */
export async function publishToRiders(topic, payload) {
  try {
    const { default: Users } = await import("../Models/Users.js");
    const riders = await Users.find({ role: "rider" }).select("_id").lean();
    if (riders.length === 0) return false;
    const riderIds = riders.map((r) => r._id.toString());
    return publishToUsers(riderIds, topic, payload);
  } catch (err) {
    console.error(`[Pusher] publishToRiders error (${topic}):`, err.message);
    return false;
  }
}

/**
 * Get the count of users currently subscribed to the admin-presence channel.
 * Pusher doesn't expose presence member lists on private channels,
 * so we track this via a heartbeat pattern or the /users/ HTTP API.
 * For now, return a placeholder — admin presence will work via channel
 * subscription events on the frontend.
 *
 * @returns {Promise<number>}
 */
export async function getAdminPresenceCount() {
  // Pusher's HTTP API doesn't expose real-time subscriber counts directly.
  // Admin presence is handled client-side via Pusher's subscription events.
  // This is a lightweight fallback.
  return 0;
}
