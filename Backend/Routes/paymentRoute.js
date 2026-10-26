import express from "express";
import {
  getAvailablePaymentMethods,
  initializePayment,
  handlePaymentCallback,
  getPaymentStatus,
  retryPayment,
} from "../Controllers/paymentController.js";
import { verifyToken, createLimiter } from "../utils/commonFunctions.js";

export const paymentRoute = express.Router();

// ── Available payment methods (public — checkout needs to list options) ──
paymentRoute.get("/methods", getAvailablePaymentMethods);

// ── Initialize online payment (authenticated) ──
paymentRoute.post(
  "/initialize",
  verifyToken,
  createLimiter(10, 5),
  initializePayment
);

// ── Gateway callbacks (public — gateway sends these) ──
// Rate-limited but no auth — the gateway doesn't have user tokens
paymentRoute.post(
  "/callback/:provider",
  createLimiter(60, 1),
  handlePaymentCallback
);

// ── Get payment status (authenticated) ──
paymentRoute.get(
  "/:paymentId/status",
  verifyToken,
  getPaymentStatus
);

// ── Retry failed payment (authenticated) ──
paymentRoute.post(
  "/retry",
  verifyToken,
  createLimiter(5, 5),
  retryPayment
);
