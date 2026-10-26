import express from "express";
import {
  verifyToken,
  verifyAdmin,
  verifyRider,
  verifyAdminOrRider,
} from "../utils/commonFunctions.js";
import {
  getActiveDeliveries,
  getRiders,
  assignRider,
  updateTrackingStatus,
  updateRiderLocation,
  getOrderTracking,
  getRiderOrders,
  getMarketplaceJobs,
  acceptMarketplaceJob,
} from "../Controllers/trackingController.js";

export const trackingRoute = express.Router();

// Admin only
trackingRoute.get("/active", verifyAdmin, getActiveDeliveries);
trackingRoute.get("/riders", verifyAdmin, getRiders);
trackingRoute.patch("/:orderId/assign-rider", verifyAdmin, assignRider);

// Admin or assigned rider
trackingRoute.patch("/:orderId/status", verifyAdminOrRider, updateTrackingStatus);

// Assigned rider only (validated inside controller)
trackingRoute.patch("/:orderId/location", verifyRider, updateRiderLocation);

// Order owner / admin / assigned rider
trackingRoute.get("/order/:orderId", verifyToken, getOrderTracking);

// Rider dashboard
trackingRoute.get("/rider/orders", verifyRider, getRiderOrders);

// Marketplace — self-accept rider jobs
trackingRoute.get("/marketplace", verifyRider, getMarketplaceJobs);
trackingRoute.patch("/marketplace/:orderId/accept", verifyRider, acceptMarketplaceJob);
