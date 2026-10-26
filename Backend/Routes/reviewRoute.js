import express from "express";
import { verifyToken, verifyAdmin } from "../utils/commonFunctions.js";
import {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  toggleHelpful,
  reportReview,
  adminListReviews,
  adminUpdateReviewStatus,
  adminDeleteReview,
  getReviewEligibility,
} from "../Controllers/reviewController.js";

export const reviewRoute = express.Router();

// ── Public: Get reviews for a product ──
// Accepts: ?page=&limit=&sort=&rating=&verified=true
reviewRoute.get("/product/:productId", getProductReviews);

// ── Authenticated: Check if user can review ──
reviewRoute.get("/product/:productId/eligibility", verifyToken, getReviewEligibility);

// ── Authenticated: Create review ──
reviewRoute.post("/product/:productId", verifyToken, createReview);

// ── Authenticated: Update own review ──
reviewRoute.patch("/:reviewId", verifyToken, updateReview);

// ── Authenticated: Delete own review ──
reviewRoute.delete("/:reviewId", verifyToken, deleteReview);

// ── Authenticated: Toggle helpful vote ──
reviewRoute.post("/:reviewId/helpful", verifyToken, toggleHelpful);

// ── Authenticated: Report a review ──
reviewRoute.post("/:reviewId/report", verifyToken, reportReview);

// ── Admin: List all reviews ──
// Accepts: ?page=&limit=&status=&rating=&search=
reviewRoute.get("/admin/all", verifyToken, verifyAdmin, adminListReviews);

// ── Admin: Update review status ──
reviewRoute.patch("/admin/:reviewId/status", verifyToken, verifyAdmin, adminUpdateReviewStatus);

// ── Admin: Delete any review ──
reviewRoute.delete("/admin/:reviewId", verifyToken, verifyAdmin, adminDeleteReview);
