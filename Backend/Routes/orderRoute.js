import express from "express";
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  trackOrder,
  getOrderInvoice,
  cancelOrder,
  updateOrderLocation,
} from "../Controllers/orderController.js";
import { verifyToken, verifyAdmin, createLimiter } from "../utils/commonFunctions.js";

export const orderRoute = express.Router();

orderRoute.post("/createOrder", verifyToken, createLimiter(10, 5), createOrder);
orderRoute.get("/myOrders", verifyToken, getMyOrders);
orderRoute.get("/getOrder/:id", verifyToken, getOrderById);
orderRoute.get("/track/:id", createLimiter(30, 5), trackOrder); // public, no auth
orderRoute.get("/:id/invoice", verifyToken, getOrderInvoice);
orderRoute.get("/getAllOrders", verifyAdmin, getAllOrders);
// Customer-initiated cancellation — ownership + status are re-validated
// server-side inside cancelOrder (only a Pending order owned by the caller).
orderRoute.post("/cancel/:orderId", verifyToken, createLimiter(10, 5), cancelOrder);
// Customer-initiated delivery-location change. Ownership, order status and
// rider-assignment are all re-validated server-side inside the controller —
// the UI check is never trusted on its own.
orderRoute.patch("/:orderId/location", verifyToken, createLimiter(10, 5), updateOrderLocation);
orderRoute.put("/updateOrder/:id", verifyAdmin, updateOrder);
orderRoute.patch("/:orderId/status", verifyToken, verifyAdmin, updateOrderStatus);
orderRoute.delete("/deleteOrder/:id", verifyAdmin, deleteOrder);
