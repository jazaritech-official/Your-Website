import mongoose from "mongoose";

/* ===========================================================
   PAYMENT MODEL
   Tracks online payment transactions initiated through the
   checkout flow. Each record captures the provider, amount,
   status, and gateway-specific transaction reference for
   reconciliation and idempotency checks.

   Backward compatible: existing COD orders have NO payment
   record — they are handled entirely by the existing
   paymentMethod/paymentStatus fields on the Order model.
   =========================================================== */
const paymentSchema = new mongoose.Schema(
  {
    // Reference to the order this payment is for
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    // The user who initiated the payment
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Payment provider identifier
    provider: {
      type: String,
      required: true,
      enum: ["jazzcash", "easypaisa", "meezan"],
      index: true,
    },
    // Amount in PKR (smallest unit: whole rupees)
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Currency (always PKR for this implementation)
    currency: {
      type: String,
      default: "PKR",
    },
    // Payment status
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    // Gateway-specific transaction reference (idempotency key)
    transactionRef: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    // Gateway-specific additional data (encrypted/sanitized — never secrets)
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Gateway redirect URL (for customer-facing payment page)
    gatewayUrl: {
      type: String,
      default: null,
    },
    // Customer phone number used for the payment (for reconciliation)
    customerPhone: {
      type: String,
      default: null,
    },
    // Failure reason (if status is "failed")
    failureReason: {
      type: String,
      default: null,
    },
    // When the payment was completed/failed
    completedAt: {
      type: Date,
      default: null,
    },
    // Idempotency: prevent duplicate processing of the same callback
    processedCallback: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient lookups during callback processing
paymentSchema.index({ order: 1, provider: 1 });
paymentSchema.index({ transactionRef: 1, provider: 1 });
// Idempotency: prevent double-processing of the same callback
paymentSchema.index({ order: 1, provider: 1, status: 1 });

export const Payment = mongoose.model("Payment", paymentSchema);
