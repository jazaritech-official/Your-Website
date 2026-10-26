import { Order } from "../Models/Orders.js";
import { Product } from "../Models/Product.js";
import { createSuccess } from "../utils/commonFunctions.js";
import { safeGet, safeSet, safeDel } from "../utils/redisCache.js";

// ── In-memory cache: the 6+ aggregations below are expensive at scale, so
// the summary is served from this module-level cache for 5 minutes. The cache
// lives in the process/module (per serverless instance) and can be force-
// cleared with ?refresh=true. ──
let analyticsCache = null;
const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (in-process, fast path)
// Shared cache key so the 5-minute window is enforced ACROSS serverless
// instances (the in-memory value only covers the instance that computed it).
const ANALYTICS_CACHE_KEY = (days) => `analytics:summary:${days}`;
const ANALYTICS_TTL_SECONDS = 300;

export const getAnalyticsSummary = async (req, res, next) => {
  try {
    // Date-range filter: default last 90 days, so aggregations scan a fraction
    // of the collection instead of every order ever placed.
    const days = parseInt(req.query.days) || 90;

    // Cache-busting: ?refresh=true bypasses the cache for this request and
    // clears the stored value so subsequent requests re-aggregate.
    if (req.query.refresh === "true") {
      analyticsCache = null;
      // Also drop the shared entry so a forced refresh is honoured everywhere.
      await safeDel(ANALYTICS_CACHE_KEY(days));
    }

    // Serve from cache if fresh (same process instance) AND for the same
    // period — otherwise switching 7d → 90d would return the 7d numbers.
    if (
      analyticsCache &&
      analyticsCache.days === days &&
      Date.now() - analyticsCache.ts < ANALYTICS_CACHE_TTL
    ) {
      return res
        .status(200)
        .json(createSuccess(200, "Analytics summary fetched", analyticsCache.data));
    }

    // Shared Redis cache — same 5-minute window, but visible to every
    // serverless instance. Final, byte-identical payload is cached.
    const redisCached = await safeGet(ANALYTICS_CACHE_KEY(days));
    if (redisCached) {
      return res
        .status(200)
        .json(createSuccess(200, "Analytics summary fetched", redisCached));
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const dateMatch = { $match: { createdAt: { $gte: fromDate } } };

    const [ordersAgg, statusAgg, topProductsAgg, totalProducts, totalUsers] =
      await Promise.all([
        // Revenue + order counts
        Order.aggregate([
          dateMatch,
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalPrice" },
              totalOrders: { $sum: 1 },
              deliveredRevenue: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "Delivered"] },
                    "$totalPrice",
                    0,
                  ],
                },
              },
            },
          },
        ]),
        // Orders grouped by status
        Order.aggregate([
          dateMatch,
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        // Top-selling products (by quantity sold)
        Order.aggregate([
          dateMatch,
          { $unwind: "$orderItems" },
          {
            $group: {
              _id: "$orderItems.product",
              unitsSold: { $sum: "$orderItems.quantity" },
              revenue: {
                $sum: {
                  $multiply: [
                    "$orderItems.quantity",
                    // Use the order's own price snapshot, never the live Product
                    // price. `$orderItems.product` is a raw ObjectId here (the
                    // $lookup runs AFTER this $group), so reading `.price` off it
                    // always yielded 0 — every top-product reported zero revenue.
                    // It is also historically wrong: revenue must not change when
                    // a product is later repriced or deleted.
                    { $ifNull: ["$orderItems.unitPrice", 0] },
                  ],
                },
              },
            },
          },
          { $sort: { unitsSold: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "products",
              localField: "_id",
              foreignField: "_id",
              as: "product",
            },
          },
          { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              name: "$product.name",
              image: { $arrayElemAt: ["$product.images.url", 0] },
              unitsSold: 1,
              revenue: 1,
            },
          },
        ]),
        Product.countDocuments(),
        // Scoped to the selected period so "Customers" matches the other cards.
        Order.distinct("user", { createdAt: { $gte: fromDate } }),
      ]);

    const totals = ordersAgg[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      deliveredRevenue: 0,
    };

    const byStatus = {};
    statusAgg.forEach((s) => {
      byStatus[s._id] = s.count;
    });

    // Revenue over time (daily, respects the selected ?days= window)
    const revenueOverTime = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: fromDate },
          status: { $ne: "Cancelled" },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$totalPrice" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const summary = {
      totalRevenue: totals.totalRevenue || 0,
      deliveredRevenue: totals.deliveredRevenue || 0,
      totalOrders: totals.totalOrders || 0,
      totalProducts,
      totalCustomers: totalUsers.length,
      byStatus,
      topProducts: topProductsAgg,
      revenueOverTime,
      periodDays: days,
    };

    // Store in cache before returning so the next request within 5 minutes
    // skips all the aggregations entirely (keyed by period). Written to BOTH
    // the in-process fast path and the shared Redis cache.
    analyticsCache = { data: summary, ts: Date.now(), days };
    await safeSet(ANALYTICS_CACHE_KEY(days), summary, ANALYTICS_TTL_SECONDS);

    return res
      .status(200)
      .json(createSuccess(200, "Analytics summary fetched", summary));
  } catch (error) {
    next(error);
  }
};
