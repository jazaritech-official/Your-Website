import express from "express";
import jwt from "jsonwebtoken";
import { verifyAdmin, createLimiter } from "../utils/commonFunctions.js";
import {
  subscribeUser,
  unsubscribeUser,
  sendPushNotification,
} from "../Controllers/pushController.js";

export const pushRoute = express.Router();

// Router-level ceiling — subscribe/unsubscribe are one-shot per device,
// and /send is admin-gated, so a 5-minute window is the right granularity
pushRoute.use(createLimiter(30, 5));

/**
 * Optional auth middleware for push subscribe:
 * Tries to verify the token but never fails — if auth is present,
 * req.user will be populated; otherwise req.user stays undefined.
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    }

    if (token) {
      jwt.verify(token, process.env.JWT, (err, user) => {
        if (!err) {
          req.user = user;
        }
        next();
      });
    } else {
      next();
    }
  } catch {
    next();
  }
};

// Public: subscribe (with optional auth — attaches userId if logged in)
// 10 attempts / hour / IP — prevents endpoint spam
pushRoute.post("/subscribe", optionalAuth, createLimiter(10, 60), subscribeUser);

// Public: unsubscribe
pushRoute.post("/unsubscribe", createLimiter(10, 60), unsubscribeUser);

// Admin-only: send push notification (broadcast or to specific user)
pushRoute.post("/send", verifyAdmin, sendPushNotification);
