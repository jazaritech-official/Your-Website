import { Notification } from "../Models/Notification.js";
import { Order } from "../Models/Orders.js";
import Users from "../Models/Users.js";
import { publishToUsers } from "./pusherHelpers.js";

/* ===========================================================
   SHARED ORDER-TRACKING HELPERS
   -----------------------------------------------------------
   Used by BOTH the REST controllers (trackingController and
   orderController.updateOrderStatus) so notification + broadcast
   logic is never duplicated.

   Real-time delivery uses Pusher data channels:
   - Events are published to each relevant user's personal Pusher room
   - The frontend subscribes to topics and filters by orderId
   =========================================================== */

/**
 * All order statuses (kept in sync with the Order model enum).
 */
export const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
  "Cancelled",
];

/**
 * Human-friendly, customer-facing message per status.
 * Falls back to a generic message for unknown statuses.
 */
const STATUS_MESSAGES = {
  Pending: "Your order has been placed and is waiting to be processed.",
  Processing: "Your order is being prepared.",
  Packed: "Your parcel has been packed.",
  Shipped: "Your order has been shipped.",
  "Out for Delivery": "Your order is out for delivery.",
  "Reached Destination": "The rider has reached your location.",
  Delivered: "Your order has been delivered successfully. Thank you for shopping with Irhas'Inn.",
  Cancelled: "Your order has been cancelled.",
};

/**
 * Customer-facing title per status — the final delivery states get a
 * celebratory title (matches the store's notification copy).
 */
const STATUS_TITLES = {
  "Reached Destination": "Order Reached",
  Delivered: "🎉 Order Delivered",
};

export const orderStatusMessage = (status, serialStr = "") =>
  STATUS_MESSAGES[status] ||
  `Your order ${serialStr} status has been updated to ${status}`;

export const orderStatusTitle = (status) => STATUS_TITLES[status] || "Order Update";

/**
 * Reusable notification side-effect for a status change:
 * creates an in-app Notification, fires a web push to the customer, and
 * broadcasts a real-time `notification:new` event via Pusher to the
 * customer's connected devices so the in-app badge/list updates instantly.
 * Fire-and-forget — never throws.
 */
export const notifyOrderStatusChange = async ({ order, status, serialStr }) => {
  try {
    const title = orderStatusTitle(status);
    const message = orderStatusMessage(status, serialStr);
    const link = `/profile/orders/${order._id}`;

    const notification = await Notification.create({
      userId: order.user,
      title,
      message,
      link,
      orderId: order._id,
    });

    try {
      const { sendPushToUser } = await import("../utils/webPush.js");
      await sendPushToUser(order.user.toString(), {
        title,
        body: message,
        link,
      });
    } catch (pushErr) {
      console.error(`[Tracking] Push send failed for order ${order._id}:`, pushErr.message || pushErr);
    }

    // Real-time in-app delivery via Pusher: publish to the customer's
    // personal room so their connected devices receive the notification instantly.
    const userId = order.user?.toString?.() || order.user;
    if (userId) {
      try {
        await publishToUsers(userId, "notification:new", notification);
      } catch (pusherErr) {
        console.error("[Tracking] Pusher notification broadcast error:", pusherErr.message);
      }
    }
  } catch (notifErr) {
    console.error(`[Tracking] Notification failed for order ${order._id}:`, notifErr.message || notifErr);
  }
};

/**
 * Notification side-effect for a CUSTOMER-INITIATED DELIVERY-LOCATION CHANGE.
 *
 * Mirrors `notifyOrderStatusChange` exactly (same three channels and the same
 * fire-and-forget contract) but with location-specific copy, because routing
 * a location change through the status notifier would send the customer a
 * misleading "your order status has been updated" message:
 *   1. in-app Notification document
 *   2. web push (best effort)
 *   3. real-time `notification:new` via Pusher to the customer's devices
 *
 * Fire-and-forget — never throws.
 */
export const notifyOrderLocationChanged = async ({ order, serialStr = "" }) => {
  try {
    const title = "Delivery Location Updated";
    const message = `Your delivery location for order ${serialStr} has been updated.`;
    const link = `/profile/orders/${order._id}`;

    const notification = await Notification.create({
      userId: order.user,
      title,
      message,
      link,
      orderId: order._id,
    });

    try {
      const { sendPushToUser } = await import("../utils/webPush.js");
      await sendPushToUser(order.user.toString(), {
        title,
        body: message,
        link,
      });
    } catch (pushErr) {
      console.error(`[Tracking] Push send failed for order ${order._id}:`, pushErr.message || pushErr);
    }

    const userId = order.user?.toString?.() || order.user;
    if (userId) {
      try {
        await publishToUsers(userId, "notification:new", notification);
      } catch (pusherErr) {
        console.error("[Tracking] Pusher notification broadcast error:", pusherErr.message);
      }
    }
  } catch (notifErr) {
    console.error(`[Tracking] Notification failed for order ${order._id}:`, notifErr.message || notifErr);
  }
};

/* -----------------------------------------------------------
   BROADCAST TRACKING EVENT VIA LIVEKIT
   -----------------------------------------------------------
   Publishes tracking events (status, location, assignment) to
   every relevant user's personal Pusher room:
   - The order owner (customer)
   - The assigned rider
   - All admins / superadmins

   Each user's frontend receives the event and filters by orderId.
   ----------------------------------------------------------- */

/**
 * Broadcast a tracking event (e.g. `tracking:status`, `tracking:location`)
 * via Pusher data channels to all relevant users' personal rooms.
 * orderId may be an ObjectId or string.
 */
export const broadcastTrackingEvent = async ({ orderId, event, data }) => {
  const orderIdStr = orderId?.toString?.() || orderId;
  if (!orderIdStr) return;

  try {
    // Find the order to determine who should receive the event
    const order = await Order.findById(orderIdStr)
      .select("user assignedRider")
      .lean();

    if (!order) return;

    const recipientIds = new Set();

    // Order owner (customer)
    const ownerId = order.user?.toString?.();
    if (ownerId) recipientIds.add(ownerId);

    // Assigned rider
    const riderId = order.assignedRider?.toString?.();
    if (riderId) recipientIds.add(riderId);

    // All admins / superadmins
    try {
      const admins = await Users.find({ role: { $in: ["admin", "superadmin"] } })
        .select("_id")
        .lean();
      admins.forEach((a) => recipientIds.add(a._id.toString()));
    } catch {
      // If admin lookup fails, still deliver to customer + rider
    }

    if (recipientIds.size === 0) return;

    // Publish to each user's personal Pusher room
    const userIds = Array.from(recipientIds);
    await publishToUsers(userIds, event, data);
  } catch (err) {
    console.error("[Tracking] Pusher broadcast error:", err.message);
  }
};

/* -----------------------------------------------------------
   DISTANCE / ETA HELPERS (haversine)
   ----------------------------------------------------------- */

const toRad = (deg) => (deg * Math.PI) / 180;

export const haversineKm = (lat1, lng1, lat2, lng2) => {
  if (
    lat1 == null || lng1 == null ||
    lat2 == null || lng2 == null ||
    Number.isNaN(Number(lat1)) || Number.isNaN(Number(lng1)) ||
    Number.isNaN(Number(lat2)) || Number.isNaN(Number(lng2))
  ) {
    return null;
  }
  const R = 6371; // Earth radius in km
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(Number(lat1))) *
      Math.cos(toRad(Number(lat2))) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Estimate distance (km) and arrival time between the rider's current
 * position and the delivery destination. Uses a configurable average
 * city delivery speed (default 25 km/h). Returns nulls when either
 * coordinate is missing.
 */
export const estimateDelivery = ({
  riderLat,
  riderLng,
  destLat,
  destLng,
  avgSpeedKmh = 25,
}) => {
  const distanceKm = haversineKm(riderLat, riderLng, destLat, destLng);
  if (distanceKm == null) return { distanceKm: null, eta: null };

  const hours = distanceKm / avgSpeedKmh;
  const eta = new Date(Date.now() + hours * 60 * 60 * 1000);
  return { distanceKm: Math.round(distanceKm * 10) / 10, eta };
};

/** Generate a human-friendly future-ready tracking number. */
export const generateTrackingNumber = (serialNumber) =>
  `IRH-${serialNumber || ""}-${Date.now().toString(36).toUpperCase().slice(-6)}`;

/**
 * Assemble exact per-status totals for the active-deliveries dashboard.
 * - `activeStatuses` are zero-filled, so every key the UI reads always exists.
 * - `statusGroups` is the $group result of a count aggregation over ALL
 *   active orders (never just the current page of results).
 * - `totalCount` (countDocuments) becomes `total`.
 */
export const buildStatusCounts = (activeStatuses, totalCount, statusGroups = []) => {
  const counts = { total: totalCount };
  for (const status of activeStatuses || []) counts[status] = 0;
  for (const group of statusGroups || []) {
    if (group && group._id != null) counts[group._id] = group.count;
  }
  return counts;
};
