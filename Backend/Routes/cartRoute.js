import express from "express";
import {
  getCart,
  addOrUpdateCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
  syncCart,
  uploadCustomizationImage,
} from "../Controllers/cartController.js";
import { verifyToken, createLimiter } from "../utils/commonFunctions.js";
import { uploadCustomizationImage as uploadCustomizationImageMiddleware } from "../utils/cloudinary.js";

export const cartRoute = express.Router();

// 🔍 Middleware Security Validation Log
cartRoute.use((req, res, next) => {
  // console.log(`[Cart Route Triggered]: ${req.method} ${req.url}`);
  next();
});

// Router-level ceiling for all cart traffic
cartRoute.use(createLimiter(120, 1));

// All cart operations require authentication
// Per-route limiters (30 cart ops / minute / IP) sit under the router ceiling
cartRoute.get("/", verifyToken, createLimiter(30, 1), getCart);
cartRoute.post("/", verifyToken, createLimiter(30, 1), addOrUpdateCartItem);
cartRoute.put("/:productId", verifyToken, createLimiter(30, 1), updateCartItem);
cartRoute.delete("/:productId", verifyToken, createLimiter(30, 1), removeCartItem);
cartRoute.delete("/", verifyToken, createLimiter(30, 1), clearCart);
cartRoute.post("/sync", verifyToken, createLimiter(30, 1), syncCart);
cartRoute.post("/upload-customization-image", verifyToken, createLimiter(20, 1), uploadCustomizationImageMiddleware.single("file"), uploadCustomizationImage);
