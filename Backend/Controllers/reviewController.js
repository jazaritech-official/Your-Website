import mongoose from "mongoose";
import { Review } from "../Models/Review.js";
import { Order } from "../Models/Orders.js";
import { Product } from "../Models/Product.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";

/* ============================================================
   REVIEW CONTROLLER — Customer Product Reviews & Ratings 2.0
   
   Features:
   - Verified purchase detection from Order history
   - Review CRUD with ownership checks
   - Rating aggregation on Product document
   - Helpful votes with dedup
   - Review reports with dedup
   - Admin moderation (approve/reject/delete)
   - Pagination + sorting + filtering
   ============================================================ */

// ── Helpers ──

/** Check if user has a delivered order containing the product */
async function verifyPurchase(userId, productId) {
  const order = await Order.findOne({
    user: userId,
    status: "Delivered",
    "orderItems.product": productId,
  }).lean();
  return order ? order._id : null;
}

/** Recalculate and update product rating aggregates atomically */
async function recalculateProductRating(productId) {
  const result = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), status: "approved" } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
        distribution: { $push: "$rating" },
      },
    },
  ]);

  const data = result[0] || { averageRating: 0, totalReviews: 0, distribution: [] };

  // Build distribution counts
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  data.distribution.forEach((r) => {
    dist[r] = (dist[r] || 0) + 1;
  });

  await Product.findByIdAndUpdate(productId, {
    averageRating: Math.round(data.averageRating * 10) / 10,
    totalReviews: data.totalReviews,
  });

  return {
    averageRating: Math.round(data.averageRating * 10) / 10,
    totalReviews: data.totalReviews,
    distribution: dist,
  };
}

/* ============================================================
   1. GET REVIEWS FOR A PRODUCT (Public)
   ============================================================ */
export const getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const sortBy = req.query.sort || "helpful"; // helpful, newest, highest, lowest, verified
    const filterRating = parseInt(req.query.rating) || null;
    const filterVerified = req.query.verified === "true";

    if (!mongoose.isValidObjectId(productId)) {
      return next(createError(400, "Invalid product id"));
    }

    // Build query
    const query = { product: productId, status: "approved" };
    if (filterRating && filterRating >= 1 && filterRating <= 5) {
      query.rating = filterRating;
    }
    if (filterVerified) {
      query.verifiedPurchase = true;
    }

    // Build sort
    let sort = {};
    switch (sortBy) {
      case "newest":
        sort = { createdAt: -1 };
        break;
      case "highest":
        sort = { rating: -1, createdAt: -1 };
        break;
      case "lowest":
        sort = { rating: 1, createdAt: -1 };
        break;
      case "verified":
        sort = { verifiedPurchase: -1, helpfulCount: -1, createdAt: -1 };
        break;
      case "helpful":
      default:
        sort = { helpfulCount: -1, createdAt: -1 };
        break;
    }

    const [reviews, totalCount] = await Promise.all([
      Review.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate("user", "username profilePic")
        .lean(),
      Review.countDocuments(query),
    ]);

    // Get rating summary
    const summary = await recalculateProductRating(productId);

    // Check if current user has already reviewed (for UI state)
    let userReview = null;
    if (req.user?.id) {
      userReview = await Review.findOne({
        product: productId,
        user: req.user.id,
        status: { $ne: "rejected" },
      }).lean();
    }

    // Check if current user has verified purchase
    let hasVerifiedPurchase = false;
    if (req.user?.id) {
      const orderId = await verifyPurchase(req.user.id, productId);
      hasVerifiedPurchase = !!orderId;
    }

    return res.status(200).json(
      createSuccess(200, "Reviews fetched successfully", {
        reviews,
        summary,
        userReview,
        hasVerifiedPurchase,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      })
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   2. CREATE A REVIEW
   ============================================================ */
export const createReview = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(productId)) {
      return next(createError(400, "Invalid product id"));
    }

    // Validate rating
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return next(createError(400, "Rating must be an integer between 1 and 5"));
    }

    // Validate comment
    if (!comment || !String(comment).trim()) {
      return next(createError(400, "Review comment is required"));
    }
    const commentText = String(comment).trim();
    if (commentText.length < 5) {
      return next(createError(400, "Review must be at least 5 characters"));
    }
    if (commentText.length > 1000) {
      return next(createError(400, "Review must not exceed 1000 characters"));
    }

    // Verify product exists
    const product = await Product.findById(productId).select("_id").lean();
    if (!product) {
      return next(createError(404, "Product not found"));
    }

    // Check for existing review (one per user per product)
    const existing = await Review.findOne({
      product: productId,
      user: userId,
      status: { $ne: "rejected" },
    });
    if (existing) {
      return next(createError(409, "You have already reviewed this product. You can edit your existing review."));
    }

    // Verify purchase
    const orderId = await verifyPurchase(userId, productId);

    // Create review
    const review = await Review.create({
      product: productId,
      user: userId,
      order: orderId || null,
      rating: ratingNum,
      title: title ? String(title).trim().slice(0, 100) : "",
      comment: commentText,
      verifiedPurchase: !!orderId,
    });

    // Recalculate product aggregates
    await recalculateProductRating(productId);

    // Populate for response
    const populated = await Review.findById(review._id)
      .populate("user", "username profilePic")
      .lean();

    return res.status(201).json(
      createSuccess(201, "Review submitted successfully", populated)
    );
  } catch (error) {
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return next(createError(409, "You have already reviewed this product"));
    }
    next(error);
  }
};

/* ============================================================
   3. UPDATE A REVIEW (Owner only)
   ============================================================ */
export const updateReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(reviewId)) {
      return next(createError(400, "Invalid review id"));
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return next(createError(404, "Review not found"));
    }

    // Ownership check
    if (review.user.toString() !== userId) {
      return next(createError(403, "You can only edit your own review"));
    }

    // Update fields
    if (rating !== undefined) {
      const ratingNum = Number(rating);
      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return next(createError(400, "Rating must be an integer between 1 and 5"));
      }
      review.rating = ratingNum;
    }
    if (title !== undefined) {
      review.title = String(title).trim().slice(0, 100);
    }
    if (comment !== undefined) {
      const commentText = String(comment).trim();
      if (commentText.length < 5) {
        return next(createError(400, "Review must be at least 5 characters"));
      }
      if (commentText.length > 1000) {
        return next(createError(400, "Review must not exceed 1000 characters"));
      }
      review.comment = commentText;
    }

    await review.save();

    // Recalculate product aggregates
    await recalculateProductRating(review.product);

    const populated = await Review.findById(review._id)
      .populate("user", "username profilePic")
      .lean();

    return res.status(200).json(
      createSuccess(200, "Review updated successfully", populated)
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   4. DELETE A REVIEW (Owner or Admin)
   ============================================================ */
export const deleteReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!mongoose.isValidObjectId(reviewId)) {
      return next(createError(400, "Invalid review id"));
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return next(createError(404, "Review not found"));
    }

    // Ownership check (admin can delete any)
    if (review.user.toString() !== userId && userRole !== "admin" && userRole !== "superadmin") {
      return next(createError(403, "You can only delete your own review"));
    }

    const productId = review.product;
    await Review.findByIdAndDelete(reviewId);

    // Recalculate product aggregates
    await recalculateProductRating(productId);

    return res.status(200).json(
      createSuccess(200, "Review deleted successfully", null)
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   5. HELPFUL VOTE (toggle)
   ============================================================ */
export const toggleHelpful = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(reviewId)) {
      return next(createError(400, "Invalid review id"));
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return next(createError(404, "Review not found"));
    }

    // Can't vote on your own review
    if (review.user.toString() === userId) {
      return next(createError(400, "You cannot vote on your own review"));
    }

    const hasVoted = review.helpfulBy.some(
      (id) => id.toString() === userId
    );

    if (hasVoted) {
      // Remove vote
      await Review.findByIdAndUpdate(reviewId, {
        $pull: { helpfulBy: userId },
        $inc: { helpfulCount: -1 },
      });
      return res.status(200).json(
        createSuccess(200, "Vote removed", { voted: false, helpfulCount: review.helpfulCount - 1 })
      );
    } else {
      // Add vote
      await Review.findByIdAndUpdate(reviewId, {
        $addToSet: { helpfulBy: userId },
        $inc: { helpfulCount: 1 },
      });
      return res.status(200).json(
        createSuccess(200, "Marked as helpful", { voted: true, helpfulCount: review.helpfulCount + 1 })
      );
    }
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   6. REPORT A REVIEW
   ============================================================ */
export const reportReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(reviewId)) {
      return next(createError(400, "Invalid review id"));
    }

    const validReasons = ["spam", "offensive", "fake", "irrelevant", "other"];
    if (!validReasons.includes(reason)) {
      return next(createError(400, `Invalid reason. Must be one of: ${validReasons.join(", ")}`));
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return next(createError(404, "Review not found"));
    }

    // Can't report your own review
    if (review.user.toString() === userId) {
      return next(createError(400, "You cannot report your own review"));
    }

    // Check for duplicate report
    const alreadyReported = review.reports.some(
      (r) => r.user.toString() === userId
    );
    if (alreadyReported) {
      return next(createError(409, "You have already reported this review"));
    }

    await Review.findByIdAndUpdate(reviewId, {
      $push: { reports: { user: userId, reason } },
      $inc: { reportCount: 1 },
    });

    return res.status(200).json(
      createSuccess(200, "Review reported. Thank you for helping maintain quality.", null)
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   7. ADMIN: LIST ALL REVIEWS
   ============================================================ */
export const adminListReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const rating = parseInt(req.query.rating) || null;
    const search = req.query.search || "";

    const query = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query.status = status;
    }
    if (rating && rating >= 1 && rating <= 5) {
      query.rating = rating;
    }

    // Search by comment or user username
    if (search) {
      query.$or = [
        { comment: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
      ];
    }

    const [reviews, totalCount] = await Promise.all([
      Review.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "username email profilePic")
        .populate("product", "name slug images")
        .lean(),
      Review.countDocuments(query),
    ]);

    return res.status(200).json(
      createSuccess(200, "Reviews fetched successfully", {
        reviews,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      })
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   8. ADMIN: UPDATE REVIEW STATUS (approve/reject)
   ============================================================ */
export const adminUpdateReviewStatus = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(reviewId)) {
      return next(createError(400, "Invalid review id"));
    }

    if (!["approved", "rejected", "pending"].includes(status)) {
      return next(createError(400, "Invalid status. Must be approved, rejected, or pending"));
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return next(createError(404, "Review not found"));
    }

    review.status = status;
    await review.save();

    // Recalculate product aggregates
    await recalculateProductRating(review.product);

    return res.status(200).json(
      createSuccess(200, "Review status updated", review)
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   9. ADMIN: DELETE A REVIEW
   ============================================================ */
export const adminDeleteReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;

    if (!mongoose.isValidObjectId(reviewId)) {
      return next(createError(400, "Invalid review id"));
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return next(createError(404, "Review not found"));
    }

    const productId = review.product;
    await Review.findByIdAndDelete(reviewId);

    // Recalculate product aggregates
    await recalculateProductRating(productId);

    return res.status(200).json(
      createSuccess(200, "Review deleted successfully", null)
    );
  } catch (error) {
    next(error);
  }
};

/* ============================================================
   10. GET REVIEW ELIGIBILITY (Check if user can review)
   ============================================================ */
export const getReviewEligibility = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(productId)) {
      return next(createError(400, "Invalid product id"));
    }

    // Check if user already has an active review
    const existingReview = await Review.findOne({
      product: productId,
      user: userId,
      status: { $ne: "rejected" },
    }).lean();

    // Check verified purchase
    const orderId = await verifyPurchase(userId, productId);

    return res.status(200).json(
      createSuccess(200, "Eligibility checked", {
        canReview: !existingReview,
        hasExistingReview: !!existingReview,
        existingReview,
        verifiedPurchase: !!orderId,
        orderId: orderId || null,
      })
    );
  } catch (error) {
    next(error);
  }
};
