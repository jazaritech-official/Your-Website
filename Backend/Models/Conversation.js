import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      // Optional: order-based conversations have it, admin-initiated
      // "direct" conversations (started from the Online Users page)
      // do not. Kept on the schema so existing order-based flows are
      // untouched — only the `required` constraint was removed.
      required: false,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /*
      What the conversation is about — drives the contextual UI (product /
      order / general support). Backward compatible: legacy conversations
      predate this field and are derived on the frontend from presence of
      orderId / productId (orderId set ⇒ "order", productId set ⇒ "product",
      neither ⇒ "general"). New conversations always store the explicit type.
    */
    conversationType: {
      type: String,
      enum: ["general", "product", "order"],
      default: "general",
    },
    // Product this conversation is about (product-type conversations only).
    // Stored as a reference — product info is always fetched live via the
    // existing product system, never duplicated into the conversation.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    lastMessage: {
      type: String,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    unreadCountForCustomer: {
      type: Number,
      default: 0,
    },
    unreadCountForAdmin: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: one conversation per customer per order.
// Uses a partial filter on orderId being an actual ObjectId so that
// order-based conversations stay unique per { customerId, orderId }
// while order-less "direct" conversations (orderId absent) are NOT
// indexed here and therefore cannot collide with each other.
// (A plain unique index would treat two missing orderIds as duplicates.)
conversationSchema.index(
  { customerId: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: "objectId" } },
  }
);
// One product conversation per customer per product (same partial-filter
// trick as the order index above — conversations without a productId cannot
// collide with each other).
conversationSchema.index(
  { customerId: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: { productId: { $type: "objectId" } },
  }
);
// Index for sorting by recent activity
conversationSchema.index({ lastMessageAt: -1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
