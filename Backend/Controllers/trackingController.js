import mongoose from "mongoose";
import { Order } from "../Models/Orders.js";
import Users from "../Models/Users.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import {
  notifyOrderStatusChange,
  broadcastTrackingEvent,
  buildStatusCounts,
  estimateDelivery,
  generateTrackingNumber,
  haversineKm,
} from "../utils/orderTrackingHelpers.js";
import { dispatchOrderStatusHooks } from "../utils/referralService.js";

/* ============================================================
   REAL-TIME ORDER TRACKING CONTROLLER
   ------------------------------------------------------------
   Security rules:
   - Admin / Super Admin: full access.
   - Assigned Rider: can view assigned orders, update rider
     location, and mark Reached Destination / Delivered only.
   - Order owner (customer): can view their own order's tracking.
   Every endpoint re-validates ownership server-side.
   ============================================================ */

const isAdmin = (role) => role === "admin" || role === "superadmin";

/* ============================================================
   AUTO "REACHED DESTINATION" — SERVER-SIDE GPS VERIFICATION
   ------------------------------------------------------------
   "Reached Destination" is NEVER set manually by a rider. The
   server advances the status only after the rider's live GPS
   position stays within REACHED_RADIUS_KM of the customer's
   delivery coordinates for REACHED_STREAK consecutive fixes.
   Values are configurable via env (defaults: 50m, 2 fixes).
   ============================================================ */
const REACHED_RADIUS_KM = Number(process.env.RIDER_REACHED_RADIUS_KM) || 0.05;
const REACHED_STREAK = Number(process.env.RIDER_REACHED_STREAK) || 2;

const populateOrder = (query) =>
  query
    .populate("user", "username email phoneNo profilePic")
    .populate("assignedRider", "username email phoneNo profilePic role")
    .populate({
      path: "orderItems.product",
      select: "name price images slug stock",
    });

const serialStr = (order) =>
  order.serialNumber
    ? `#${order.serialNumber}`
    : order._id.toString().slice(-8).toUpperCase();

/* ============================================================
   1. GET ACTIVE DELIVERY ORDERS (ADMIN)
   ============================================================ */
export const getActiveDeliveries = async (req, res, next) => {
  try {
    const activeStatuses = [
      "Shipped",
      "Out for Delivery",
      "Reached Destination",
    ];

    // SECURITY: Pagination to prevent unbounded result sets at scale.
    // Max 100 per page to bound response size and DB load.
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [orders, totalCount, statusGroups] = await Promise.all([
      populateOrder(
        Order.find({ status: { $in: activeStatuses } })
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
      ).lean(),
      Order.countDocuments({ status: { $in: activeStatuses } }),
      // Exact server-wide per-status totals — the dashboard must never
      // report counts derived from only the current page of results.
      Order.aggregate([
        { $match: { status: { $in: activeStatuses } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts = buildStatusCounts(activeStatuses, totalCount, statusGroups);

    // Attach estimated distance + ETA for each order using the latest
    // rider position vs the delivery destination.
    const enriched = orders.map((order) => {
      const { distanceKm, eta } = estimateDelivery({
        riderLat: order.riderLocation?.lat,
        riderLng: order.riderLocation?.lng,
        destLat: order.shippingAddress?.latitude,
        destLng: order.shippingAddress?.longitude,
      });
      return { ...order, estimatedDistanceKm: distanceKm, estimatedEta: eta };
    });

    return res
      .status(200)
      .json(createSuccess(200, "Active deliveries fetched successfully", {
        orders: enriched,
        statusCounts,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
      }));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   2. LIST RIDERS (ADMIN)
   ============================================================ */
export const getRiders = async (req, res, next) => {
  try {
    const riders = await Users.find({ role: "rider" })
      .select("username email phoneNo profilePic role")
      .sort({ username: 1 })
      .lean();

    return res
      .status(200)
      .json(createSuccess(200, "Riders fetched successfully", riders));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   3. ASSIGN RIDER TO ORDER (ADMIN)
   ============================================================ */
export const assignRider = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { riderId } = req.body;

    if (!mongoose.isValidObjectId(orderId)) {
      return next(createError(400, "Invalid order id"));
    }
    if (!mongoose.isValidObjectId(riderId)) {
      return next(createError(400, "Invalid rider id"));
    }

    const rider = await Users.findOne({ _id: riderId, role: "rider" }).select(
      "username email phoneNo profilePic role"
    );
    if (!rider) {
      return next(createError(404, "Rider not found"));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    const isNewAssignment =
      !order.assignedRider || order.assignedRider.toString() !== riderId;

    order.assignedRider = riderId;
    if (!order.trackingNumber) {
      order.trackingNumber = generateTrackingNumber(order.serialNumber);
    }
    order.trackingMetadata = {
      ...(order.trackingMetadata || {}),
      riderAssignedAt: isNewAssignment ? new Date() : order.trackingMetadata?.riderAssignedAt,
    };
    await order.save();

    // Notify the rider about the new assignment (only on new assignment)
    if (isNewAssignment) {
      try {
        const { Notification } = await import("../Models/Notification.js");
        await Notification.create({
          userId: riderId,
          title: "New Delivery Assigned",
          message: `You have been assigned order ${serialStr(order)}.`,
          link: "/rider",
          orderId: order._id,
        });
      } catch (notifErr) {
        console.error("[Tracking] Rider notification error:", notifErr.message);
      }
    }

    const enriched = await populateOrder(Order.findById(orderId)).lean();

    // Broadcast assignment so admins + rider dashboards update live
    await broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:assignment",
      data: {
        orderId: order._id,
        assignedRider: rider,
        trackingNumber: order.trackingNumber,
      },
    });

    return res
      .status(200)
      .json(createSuccess(200, "Rider assigned successfully", enriched));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   4. UPDATE ORDER STATUS (ADMIN or ASSIGNED RIDER)
   ------------------------------------------------------------
   Rules:
   - Admin / Super Admin can set any status (override).
   - Assigned Rider can ONLY mark "Reached Destination" and
     "Delivered" — nothing else.
   ============================================================ */
export const updateTrackingStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return next(createError(400, "Status is required"));
    }

    const validStatuses = [
      "Pending",
      "Processing",
      "Packed",
      "Shipped",
      "Out for Delivery",
      "Reached Destination",
      "Delivered",
      "Cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return next(
        createError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`)
      );
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    const previousStatus = order.status;

    const userRole = req.user.role;
    const isAssignedRider =
      userRole === "rider" &&
      order.assignedRider &&
      order.assignedRider.toString() === req.user.id;

    // Authorization: admin can always; rider only if assigned AND only
    // allowed to mark reached/delivered.
    if (!isAdmin(userRole) && !isAssignedRider) {
      return next(createError(403, "You are not authorized to update this order"));
    }

    // STRICT BUSINESS RULE: "Reached Destination" is generated ONLY by
    // the server via GPS proximity verification (updateRiderLocation). A
    // rider attempting to set it manually is rejected with an error.
    // Riders may only mark "Delivered" — admins/super-admins can override
    // any status when required.
    if (userRole === "rider" && status !== "Delivered") {
      return next(
        createError(
          403,
          "Riders can only mark 'Delivered' — 'Reached Destination' is set automatically by the system when you arrive at the customer location"
        )
      );
    }

    // Guard (riders only): delivered must move forward from the delivery
    // flow. Admins can override any status when required.
    if (
      userRole === "rider" &&
      status === "Delivered" &&
      !["Shipped", "Out for Delivery", "Reached Destination"].includes(order.status)
    ) {
      return next(
        createError(
          400,
          "Order must be shipped or out for delivery before delivering"
        )
      );
    }

    const now = new Date();
    order.status = status;
    order.trackingHistory.push({ status, timestamp: now });

    if (status === "Reached Destination") {
      order.reachedTime = now;
      order.trackingMetadata = {
        ...(order.trackingMetadata || {}),
        reachedBy: req.user.id,
      };
    }
    if (status === "Delivered") {
      order.deliveredTime = now;
      order.trackingMetadata = {
        ...(order.trackingMetadata || {}),
        deliveredBy: req.user.id,
      };
    }
    if (!order.trackingNumber) {
      order.trackingNumber = generateTrackingNumber(order.serialNumber);
    }

    await order.save();

    // Reuse the existing notification system (in-app + push + real-time
    // socket) — only when the status actually changed, so re-submitting the
    // same status never creates a duplicate notification.
    if (previousStatus !== status) {
      await notifyOrderStatusChange({
        order,
        status,
        serialStr: serialStr(order),
      });

      // Referral rewards lifecycle — credits on Delivered, cancels/refunds
      // on Cancelled. Idempotent, so re-submitting a status is safe.
      dispatchOrderStatusHooks(order, status);
    }

    const enriched = await populateOrder(Order.findById(orderId)).lean();

    await broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:status",
      data: {
        orderId: order._id,
        status,
        trackingHistory: order.trackingHistory,
        reachedTime: order.reachedTime,
        deliveredTime: order.deliveredTime,
        updatedAt: order.updatedAt,
      },
    });

    // ── Marketplace broadcast: when an order becomes "Shipped" with no
    // assigned rider, notify all connected riders about the new available job.
    // Guarded by previousStatus so re-submitting "Shipped" on an already-
    // Shipped order never re-broadcasts the job.
    if (status === "Shipped" && !order.assignedRider && previousStatus !== "Shipped") {
      broadcastNewMarketplaceJob(order._id);
    }

    return res
      .status(200)
      .json(createSuccess(200, "Order status updated successfully", enriched));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   5. UPDATE RIDER LIVE LOCATION (ASSIGNED RIDER)
   ------------------------------------------------------------
   Throttled: DB is only written when the rider moved at least
   ~50m OR the last write is older than 10s. Coordinates are
   overwritten (never appended) so we don't spam the database.
   ============================================================ */
export const updateRiderLocation = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { lat, lng } = req.body;

    if (!mongoose.isValidObjectId(orderId)) {
      return next(createError(400, "Invalid order id"));
    }
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return next(createError(400, "Valid latitude and longitude are required"));
    }
    if (Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180) {
      return next(createError(400, "Coordinates out of range"));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Only the assigned rider may post their location for this order
    const isAssignedRider =
      order.assignedRider &&
      order.assignedRider.toString() === req.user.id;
    if (!isAssignedRider) {
      return next(createError(403, "You are not the assigned rider for this order"));
    }

    const now = Date.now();
    const prev = order.riderLocation || {};
    const lastUpdateAt = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
    const moved = haversineKm(prev.lat, prev.lng, Number(lat), Number(lng));

    // Distance to the customer's delivery destination — computed on the
    // SERVER. The client can never assert proximity on its own.
    const destLat = order.shippingAddress?.latitude;
    const destLng = order.shippingAddress?.longitude;
    const distanceToDest = haversineKm(Number(lat), Number(lng), destLat, destLng);
    const withinReachRadius = distanceToDest != null && distanceToDest <= REACHED_RADIUS_KM;
    const inDeliveryFlow = ["Shipped", "Out for Delivery", "Reached Destination"].includes(
      order.status
    );
    // Only bypass the write-throttle while the proximity streak can still
    // advance. Once the order is auto-marked "Reached Destination" (or is
    // already Delivered), a parked rider stops spamming the DB.
    const trackingProximity =
      withinReachRadius && inDeliveryFlow && order.status !== "Reached Destination";

    // A stale in-range streak must be cleared the moment the rider leaves
    // the radius, even if the location write would otherwise be throttled —
    // otherwise returning in-range could auto-Reached with fewer than
    // REACHED_STREAK fresh consecutive fixes.
    const staleStreak =
      !withinReachRadius && (order.trackingMetadata?.proximityStreak || 0) > 0;

    // Skip DB write when the rider basically hasn't moved (moved under ~50m)
    // AND we already wrote within the last 60s — a stationary rider on a
    // 20s client cadence then only touches the DB once a minute instead of
    // 3×/min. Movement always persists immediately. The proximity streak
    // (auto "Reached Destination") is NOT throttled — consecutive valid
    // fixes near the destination must be recorded to verify arrival.
    // Still returns success so the client keeps its cadence.
    if (
      !trackingProximity &&
      !staleStreak &&
      lastUpdateAt &&
      now - lastUpdateAt < 60000 &&
      (moved == null || moved < 0.05)
    ) {
      return res.status(200).json(
        createSuccess(200, "Location unchanged, skipping update", order.riderLocation)
      );
    }

    order.riderLocation = {
      lat: Number(lat),
      lng: Number(lng),
      updatedAt: new Date(now),
    };
    order.trackingMetadata = {
      ...(order.trackingMetadata || {}),
      lastLocationUpdate: new Date(now),
    };

    // ── AUTO "REACHED DESTINATION" (server-side, GPS-verified) ──────────
    // Count CONSECUTIVE valid fixes within REACHED_RADIUS_KM of the
    // destination. Any fix outside the radius resets the streak. After
    // REACHED_STREAK consecutive in-range fixes the server automatically
    // advances the order to "Reached Destination" — the rider cannot set
    // this status manually (see updateTrackingStatus).
    let autoReached = false;
    if (trackingProximity) {
      const streak = (order.trackingMetadata?.proximityStreak || 0) + 1;
      order.trackingMetadata = {
        ...order.trackingMetadata,
        proximityStreak: streak,
        lastProximityAt: new Date(now),
      };
      if (streak >= REACHED_STREAK) {
        autoReached = true;
        order.status = "Reached Destination";
        order.reachedTime = new Date(now);
        order.trackingHistory.push({ status: "Reached Destination", timestamp: new Date(now) });
        order.trackingMetadata = {
          ...order.trackingMetadata,
          reachedBy: "system-gps",
          proximityStreak: 0, // reset — status already advanced
        };
      }
    } else if (!withinReachRadius) {
      // Rider left the radius — reset the consecutive-fix streak.
      order.trackingMetadata = {
        ...order.trackingMetadata,
        proximityStreak: 0,
      };
    }

    await order.save();

    const { distanceKm, eta } = estimateDelivery({
      riderLat: order.riderLocation.lat,
      riderLng: order.riderLocation.lng,
      destLat,
      destLng,
    });

    await broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:location",
      data: {
        orderId: order._id,
        riderLocation: order.riderLocation,
        estimatedDistanceKm: distanceKm,
        estimatedEta: eta,
      },
    });

    // Broadcast the auto-reached transition to customer + admin + rider
    // and notify the customer (in-app + push), exactly like a normal
    // status change.
    if (autoReached) {
      await notifyOrderStatusChange({
        order,
        status: "Reached Destination",
        serialStr: serialStr(order),
      });
      await broadcastTrackingEvent({
        orderId: order._id,
        event: "tracking:status",
        data: {
          orderId: order._id,
          status: "Reached Destination",
          trackingHistory: order.trackingHistory,
          reachedTime: order.reachedTime,
          deliveredTime: order.deliveredTime,
          updatedAt: order.updatedAt,
        },
      });
    }

    return res
      .status(200)
      .json(
        createSuccess(200, "Location updated", {
          riderLocation: order.riderLocation,
          estimatedDistanceKm: distanceKm,
          estimatedEta: eta,
          autoReached,
        })
      );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   6. GET FULL TRACKING FOR AN ORDER
   (ORDER OWNER / ADMIN / ASSIGNED RIDER)
   ============================================================ */
export const getOrderTracking = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return next(createError(400, "Invalid order id"));
    }

    const order = await populateOrder(Order.findById(orderId)).lean();
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    const userId = req.user.id;
    const userRole = req.user.role;
    const isOwner =
      order.user?._id?.toString() === userId || order.user?.toString() === userId;
    const isAssignedRider =
      userRole === "rider" &&
      order.assignedRider &&
      (order.assignedRider?._id?.toString() === userId ||
        order.assignedRider?.toString() === userId);

    if (!isOwner && !isAdmin(userRole) && !isAssignedRider) {
      return next(createError(403, "You are not authorized to view this order"));
    }

    const { distanceKm, eta } = estimateDelivery({
      riderLat: order.riderLocation?.lat,
      riderLng: order.riderLocation?.lng,
      destLat: order.shippingAddress?.latitude,
      destLng: order.shippingAddress?.longitude,
    });

    const tracking = {
      _id: order._id,
      serialNumber: order.serialNumber,
      trackingNumber: order.trackingNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      itemsPrice: order.itemsPrice,
      shippingPrice: order.shippingPrice,
      totalPrice: order.totalPrice,
      discountAmount: order.discountAmount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      trackingHistory: order.trackingHistory,
      riderLocation: order.riderLocation || null,
      reachedTime: order.reachedTime,
      deliveredTime: order.deliveredTime,
      eta: order.eta,
      estimatedDistanceKm: distanceKm,
      estimatedEta: eta,
      assignedRider: order.assignedRider
        ? {
            _id: order.assignedRider._id,
            username: order.assignedRider.username,
            phoneNo: order.assignedRider.phoneNo,
            profilePic: order.assignedRider.profilePic,
          }
        : null,
      shippingAddress: order.shippingAddress,
      orderItems: (order.orderItems || []).map((item) => ({
        quantity: item.quantity,
        product: item.product
          ? {
              _id: item.product._id,
              name: item.product.name,
              price: item.product.price,
              images: item.product.images,
            }
          : null,
      })),
    };

    return res
      .status(200)
      .json(createSuccess(200, "Order tracking fetched successfully", tracking));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   7. RIDER DASHBOARD — TODAY'S DELIVERIES + ACTIVE ASSIGNMENTS
   ============================================================ */
export const getRiderOrders = async (req, res, next) => {
  try {
    const riderId = req.user.id;

    const [activeOrders, deliveredToday] = await Promise.all([
      populateOrder(
        Order.find({
          assignedRider: riderId,
          status: { $in: ["Shipped", "Out for Delivery", "Reached Destination"] },
        }).sort({ updatedAt: -1 })
      ).lean(),
      populateOrder(
        Order.find({
          assignedRider: riderId,
          status: "Delivered",
          deliveredTime: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }).sort({ deliveredTime: -1 })
      ).lean(),
    ]);

    const grouped = {
      pending: activeOrders.filter((o) => o.status === "Shipped"),
      outForDelivery: activeOrders.filter((o) => o.status === "Out for Delivery"),
      reached: activeOrders.filter((o) => o.status === "Reached Destination"),
      delivered: deliveredToday,
    };

    return res
      .status(200)
      .json(
        createSuccess(200, "Rider orders fetched successfully", {
          ...grouped,
          counts: {
            pending: grouped.pending.length,
            outForDelivery: grouped.outForDelivery.length,
            reached: grouped.reached.length,
            delivered: grouped.delivered.length,
          },
        })
      );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   8. MARKETPLACE — AVAILABLE JOBS (Self-Accept)
   ============================================================
   Returns orders with status "Shipped" and no assignedRider.
   Shows pickup area (city), shipping price, and order summary —
   withholds exact address/phone until after acceptance.
   ============================================================ */
export const getMarketplaceJobs = async (req, res, next) => {
  try {
    const jobs = await populateOrder(
      Order.find({
        status: "Shipped",
        assignedRider: null,
      }).sort({ updatedAt: -1 })
    ).lean();

    // Sanitize: withhold exact address/phone until accepted
    const sanitized = jobs.map((job) => ({
      _id: job._id,
      serialNumber: job.serialNumber,
      trackingNumber: job.trackingNumber,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      // Normalized so a legacy/null value can never surface as NaN downstream
      // (the card shows "Free" for 0 — see JobCard).
      shippingPrice: Number(job.shippingPrice) || 0,
      totalPrice: job.totalPrice,
      // Coarse location only (city — no exact address/phone)
      deliveryCity: job.shippingAddress?.city || "",
      // Order summary (what's being delivered)
      itemCount: job.orderItems?.length || 0,
      firstItemName: job.orderItems?.[0]?.product?.name || "",
      firstItemImage: job.orderItems?.[0]?.product?.images?.[0] || null,
      totalQuantity: job.orderItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0,
    }));

    return res
      .status(200)
      .json(createSuccess(200, "Marketplace jobs fetched", sanitized));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   9. MARKETPLACE — ACCEPT A JOB (Atomic)
   ============================================================
   Single atomic findOneAndUpdate: only succeeds if the order
   still has status "Shipped" AND assignedRider is null.
   If two riders accept simultaneously, exactly one wins.
   ============================================================ */
export const acceptMarketplaceJob = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const riderId = req.user.id;

    if (!mongoose.isValidObjectId(orderId)) {
      return next(createError(400, "Invalid order id"));
    }

    // Atomic: only succeeds if order is Shipped AND unassigned
    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: "Shipped",
        assignedRider: null,
      },
      {
        $set: {
          assignedRider: riderId,
          trackingNumber: generateTrackingNumber(
            (await Order.findById(orderId).select("serialNumber").lean())?.serialNumber
          ),
        },
      },
      { new: true }
    );

    if (!order) {
      // Check why it failed — give a specific message
      const existing = await Order.findById(orderId).select("status assignedRider").lean();
      if (!existing) {
        return next(createError(404, "Order not found"));
      }
      if (existing.assignedRider) {
        return next(createError(409, "This order was just taken by another rider"));
      }
      return next(createError(400, `Order is no longer available (status: ${existing.status})`));
    }

    // Fetch the rider info for the broadcast
    const rider = await Users.findById(riderId)
      .select("username email phoneNo profilePic role")
      .lean();

    const enriched = await populateOrder(Order.findById(orderId)).lean();

    // Broadcast assignment to admin + customer + rider
    await broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:assignment",
      data: {
        orderId: order._id,
        assignedRider: rider,
        trackingNumber: order.trackingNumber,
      },
    });

    // Notify the rider
    try {
      const { Notification } = await import("../Models/Notification.js");
      await Notification.create({
        userId: riderId,
        title: "New Delivery Assigned",
        message: `You have accepted order #${order.serialNumber || order._id.slice(-8).toUpperCase()}.`,
        link: "/rider",
        orderId: order._id,
      });
    } catch (notifErr) {
      console.error("[Marketplace] Rider notification error:", notifErr.message);
    }

    return res
      .status(200)
      .json(createSuccess(200, "Order accepted successfully", enriched));
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   10. BROADCAST NEW MARKETPLACE JOB
   ============================================================
   Called after an order status changes to "Shipped" with no
   assignedRider — broadcasts to all connected riders.
   ============================================================ */
export const broadcastNewMarketplaceJob = async (orderId) => {
  try {
    const order = await populateOrder(
      Order.findById(orderId).select(
        "serialNumber trackingNumber status shippingPrice shippingAddress orderItems"
      )
    ).lean();

    if (!order || order.status !== "Shipped" || order.assignedRider) return;

    const jobPayload = {
      _id: order._id,
      serialNumber: order.serialNumber,
      trackingNumber: order.trackingNumber,
      status: order.status,
      shippingPrice: Number(order.shippingPrice) || 0,
      deliveryCity: order.shippingAddress?.city || "",
      itemCount: order.orderItems?.length || 0,
      firstItemName: order.orderItems?.[0]?.product?.name || "",
      firstItemImage: order.orderItems?.[0]?.product?.images?.[0] || null,
      totalQuantity: order.orderItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0,
    };

    // Import publishToRiders dynamically to avoid circular deps
    const { publishToRiders } = await import("../utils/pusherHelpers.js");
    await publishToRiders("marketplace:new_job", jobPayload);

    // Best-effort web push to eligible riders' registered devices (works
    // when the dashboard tab is backgrounded/closed). Fire-and-forget: a
    // push failure must never break the realtime broadcast above.
    import("../utils/webPush.js")
      .then(({ sendPushToRiders }) =>
        sendPushToRiders({
          title: "New Delivery Available",
          body: `A new delivery job is available in ${
            jobPayload.deliveryCity || "your area"
          }. Open Rider Hub to view details.`,
          link: "/rider",
        })
      )
      .catch((pushErr) =>
        console.error("[Marketplace] Rider push error:", pushErr.message || pushErr)
      );
  } catch (err) {
    console.error("[Marketplace] Broadcast error:", err.message);
  }
};
