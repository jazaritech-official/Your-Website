import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    serialNumber: {
      type: Number,
      unique: true,
      sparse: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Order type: normal or bulk
    orderType: {
      type: String,
      enum: ["normal", "bulk"],
      default: "normal",
    },
    orderItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        selectedColor: {
          type: String,
          trim: true,
          default: "",
        },
        selectedSize: {
          type: String,
          trim: true,
          default: "",
        },
        customizationAnswers: [
          {
            label: { type: String, required: true },
            value: { type: String, required: true },
          },
        ],
        /*
        Price snapshot — captures the price/name/image AT TIME OF PURCHASE so
        invoices, order history and analytics keep showing the original price
        even if the product price changes later. Backward compatible: old
        orders without these fields fall back to the populated product.
        */
        unitPrice: {
          type: Number,
          required: false,
          default: 0,
          min: 0,
        },
        totalItemPrice: {
          type: Number,
          required: false,
          default: 0,
          min: 0,
        },
        productName: {
          type: String,
          default: "",
        },
        productImage: {
          type: String,
          default: "",
        },
        /*
        Print-layout snapshot — captured AT ORDER TIME so past orders never
        visually change even if the product's print layout is re-detected or
        the product image is swapped later. Backward compatible: old orders
        without these fields fall back to the product's live layout.
        */
        printLayout: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
        renderVersion: {
          type: String,
          default: "",
        },
        previewMetadata: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
      },
    ],
    shippingAddress: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },
      phoneNo: {
        type: String,
        required: true,
        trim: true,
      },
      address: {
        type: String,
        required: true,
        trim: true,
      },
      city: {
        type: String,
        required: true,
        trim: true,
        default: "Karachi",
      },
      country: {
        type: String,
        default: "Pakistan",
      },
      latitude: {
        type: Number,
        default: undefined,
      },
      longitude: {
        type: Number,
        default: undefined,
      },
    },
    paymentMethod: {
      type: String,
      required: true,
      default: "Cash on Delivery",
    },
    paymentStatus: {
      type: String,
      // "cancelled" is offered in the Admin Orders UI (paymentStatusOptions)
      // and written via PUT /order/updateOrder/:id — it must be a valid enum
      // value or that save throws a ValidationError → 500. Additive change,
      // backward compatible with existing orders.
      enum: ["pending", "paid", "failed", "refunded", "cancelled"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Packed", "Shipped", "Out for Delivery", "Reached Destination", "Delivered", "Cancelled"],
      default: "Pending",
    },
    trackingHistory: [
      {
        status: {
          type: String,
          enum: ["Pending", "Processing", "Packed", "Shipped", "Out for Delivery", "Reached Destination", "Delivered", "Cancelled"],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        // Optional human-readable note (e.g. "Cancelled by customer — <reason>").
        note: {
          type: String,
          default: "",
        },
      },
    ],
    /*
    ===========================================================
    CUSTOMER ORDER CANCELLATION + INVENTORY RESTORATION
    ===========================================================
    cancelledBy  — who cancelled the order ("customer" | "admin"). Drives the
                   "Cancelled By Customer" badge in the admin panel and the
                   customer-facing tracking page.
    cancelReason — optional customer-provided reason (capped at 500 chars).
    cancelledAt  — when the cancellation happened.
    inventoryRestored — idempotency flag: stock is restored EXACTLY once.
                   The flag is claimed atomically (findOneAndUpdate with a
                   condition) BEFORE any stock is incremented, so concurrent
                   requests (customer cancel + admin delete racing, or a
                   re-sent status) can never restore the same order twice.
    */
    cancelledBy: {
      type: String,
      enum: ["admin", "customer"],
      default: null,
    },
    cancelReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    inventoryRestored: {
      type: Boolean,
      default: false,
    },
    inventoryRestoredAt: {
      type: Date,
      default: null,
    },
    /*
    CUSTOMER DELIVERY-LOCATION CHANGE (additive / backward compatible)
    -----------------------------------------------------------
    A customer may move the delivery pin/address of their own order while it
    is still pre-dispatch (Pending / Processing / Packed) and no rider has
    been assigned. These two audit fields record that the destination was
    edited; both are optional and default to "never changed", so orders
    placed before this feature keep working untouched. The per-change detail
    (who/when/why) is recorded as an entry in `trackingHistory`.
    */
    locationChangedAt: {
      type: Date,
      default: null,
    },
    locationChangeCount: {
      type: Number,
      default: 0,
    },
    /*
    Shipping-fee adjustments applied AFTER the order was placed, when a
    "change location" moved it to a different city with a different city-wise
    fee. Append-only audit trail (never rewritten), optional and defaulting to
    empty, so orders placed before this feature are unaffected. The order's
    live `shippingPrice` / `totalPrice` always hold the CURRENT values; these
    entries are the history of how they got there.
    */
    shippingAdjustments: [
      {
        fromShipping: { type: Number, default: 0, min: 0 },
        toShipping: { type: Number, default: 0, min: 0 },
        difference: { type: Number, default: 0 },
        fromCity: { type: String, default: "" },
        toCity: { type: String, default: "" },
        reason: { type: String, default: "" },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    /*
    ===========================================================
    REAL-TIME ORDER TRACKING FIELDS
    ===========================================================
    All fields are optional / additive so existing orders and
    the legacy status flow keep working unchanged.
    */
    trackingNumber: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    assignedRider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Latest known rider coordinates only (overwritten in place — never append)
    riderLocation: {
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    reachedTime: {
      type: Date,
      default: null,
    },
    deliveredTime: {
      type: Date,
      default: null,
    },
    eta: {
      type: Date,
      default: null,
    },
    trackingMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    itemsPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /*
    ===========================================================
    REFERRAL REWARDS (additive — existing orders are unaffected)
    ===========================================================
    */
    referralCode: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    walletRedemptionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null,
    },
    /*
    Checkout idempotency: the client sends one key per checkout attempt.
    The unique sparse index makes duplicate submissions (double-click, or
    refresh/retry while the first request is still in flight) return the
    already-created order instead of creating a second one — which also
    guarantees the wallet is never debited twice and a referral reward is
    never reserved twice for the same checkout.
    */
    idempotencyKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/* Efficient queries for active deliveries and rider dashboards */
orderSchema.index({ assignedRider: 1, status: 1 });
orderSchema.index({ status: 1, updatedAt: -1 });

/* Referral eligibility: sum lifetime DELIVERED spend per user */
orderSchema.index({ user: 1, status: 1 });

/* Tier 3: date-range scans in admin analytics (getAnalytics/overview) and the
   default newest-first list sorts — additive, no behavior change. */
orderSchema.index({ createdAt: -1 });

/*
Checkout idempotency: one order per idempotency key (unique + sparse).
The EXPLICIT name matches scripts/hardenReferralLedger.js so mongoose autoIndex
and the migration create an identical index spec — idempotent in any order,
never an IndexOptionsConflict.
*/
orderSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true, name: "idempotencyKey_1_unique" }
);

/* Admin search: tracking number partial match */
orderSchema.index({ trackingNumber: 1 }, { sparse: true });

export const Order = mongoose.model("Order", orderSchema);
