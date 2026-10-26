import mongoose from "mongoose";

/* ============================================================
   REVIEW MODEL — Customer Product Reviews & Ratings 2.0
   
   Dedicated collection for product reviews. The legacy
   `ratings` array embedded in Product is preserved for
   backward compatibility but this collection becomes the
   authoritative source of truth for the new review system.
   
   Key design decisions:
   - Separate collection (not embedded in Product) for scalability
   - moderation status: pending → approved | rejected
   - verifiedPurchase: computed server-side from Order history
   - helpful votes: atomic $inc on Review document
   - reports: array of { user, reason } with dedup per user
   ============================================================ */

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false, // null for non-verified reviews (if allowed)
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    comment: {
      type: String,
      required: [true, "Review comment is required"],
      trim: true,
      minlength: 5,
      maxlength: 1000,
    },
    // Moderation status — reviews start as "approved" by default
    // (auto-approve on creation), but admins can moderate later.
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true,
    },
    // Server-derived — never accepted from client
    verifiedPurchase: {
      type: Boolean,
      default: false,
    },
    // Helpful votes count (atomic $inc)
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Users who voted helpful (for dedup)
    helpfulBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Reports
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reports: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        reason: {
          type: String,
          enum: ["spam", "offensive", "fake", "irrelevant", "other"],
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ── Indexes (justified by actual query patterns) ──

// Product reviews list: all approved reviews for a product, sorted by helpful
reviewSchema.index({ product: 1, status: 1, helpfulCount: -1, createdAt: -1 });

// Product reviews list: newest first
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

// User's own reviews
reviewSchema.index({ user: 1, createdAt: -1 });

// Duplicate prevention: one active review per user per product
reviewSchema.index(
  { product: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "rejected" } } }
);

// Admin moderation: filter by status + rating
reviewSchema.index({ status: 1, rating: 1, createdAt: -1 });

// Admin search: reported reviews
reviewSchema.index({ reportCount: { $gt: 0 }, status: 1 });

// Purchase verification lookup
reviewSchema.index({ order: 1, product: 1, user: 1 }, { sparse: true });

export const Review = mongoose.model("Review", reviewSchema);
