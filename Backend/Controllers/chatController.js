import mongoose from "mongoose";
import { Conversation } from "../Models/Conversation.js";
import { Message } from "../Models/Message.js";
import { Notification } from "../Models/Notification.js";
import { Product } from "../Models/Product.js";
import { Order } from "../Models/Orders.js";
import { sendPushToUser } from "../utils/webPush.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import Users from "../Models/Users.js";
import { publishToUsers } from "../utils/pusherHelpers.js";

// Escape regex special characters so user input is treated literally
// in $regex queries (same utility as productController.js).
const escapeRegExp = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Direct (order-less) conversations are stored without an orderId. */
const DIRECT_CONV_QUERY = { orderId: null };

/**
 * Best-effort link for a conversation: order-based conversations deep-link
 * to the order chat, product-based conversations to the product chat,
 * direct/general conversations to the plain chat page.
 */
const conversationLink = (conversation) => {
  if (conversation.orderId) return `/chat?order=${conversation.orderId}`;
  if (conversation.productId) return `/chat?product=${conversation.productId}`;
  return "/chat";
};

/** Populate the context references used by the chat UI (product / order). */
const populateContext = (query) =>
  query
    .populate("customerId", "username email phoneNo profilePic")
    .populate("productId", "name price images")
    .populate("orderId", "serialNumber status totalPrice");

/**
 * Offline notification deduplication tracking.
 * Key format: `${recipientId}:${conversationId}`
 * Value: boolean (true = already notified during this offline session)
 * 
 * Same pattern used across chat handlers for consistency.
 * Ensures that while a recipient remains continuously offline, only ONE
 * notification is sent per conversation per offline session.
 */
const notifiedOffline = new Map();

/**
 * Publish a chat event to Pusher rooms for real-time delivery.
 * Publishes to the customer's room AND all admin rooms so everyone
 * in the conversation receives the event.
 */
async function publishChatEvent(conversationId, topic, payload, senderId) {
  try {
    // Find the conversation to get the customer id
    const conv = await Conversation.findById(conversationId).select("customerId").lean();
    if (!conv) return;

    const customerId = conv.customerId?.toString();

    // Find all admin user ids
    const admins = await Users.find({ role: { $in: ["admin", "superadmin"] } })
      .select("_id")
      .lean();
    const adminIds = admins.map((a) => a._id.toString());

    // Publish to customer + all admins (skip the sender to avoid echo)
    const recipientIds = [];
    if (customerId && customerId !== senderId) recipientIds.push(customerId);
    adminIds.forEach((id) => {
      if (id !== senderId) recipientIds.push(id);
    });

    if (recipientIds.length > 0) {
      await publishToUsers(recipientIds, topic, payload);
    }
  } catch {
    // Silent — the message is already in the DB and will appear on refresh
  }
}

// ==========================================
// 1. GET CONVERSATIONS
// ==========================================
export const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === "admin" || userRole === "superadmin") {
      // Admin sees ALL conversations, sorted by most recent activity,
      // paginated so the panel stays responsive at 10k+ conversations.
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const filter = {};
      if (req.query.search) {
        // Search by customer name — requires a two-step lookup:
        // resolve matching user ids, then match those (or the order id).
        const search = escapeRegExp(req.query.search);
        const matchingUsers = await Users.find({
          $or: [
            { name: { $regex: search, $options: "i" } },
            { username: { $regex: search, $options: "i" } },
          ],
        })
          .select("_id")
          .lean();

        filter.$or = [
          { customerId: { $in: matchingUsers.map((u) => u._id) } },
          // Only match orderId when the search is a valid ObjectId,
          // otherwise Mongoose would throw a CastError on the ref field.
          ...(mongoose.Types.ObjectId.isValid(search)
            ? [{ orderId: search }]
            : []),
        ];
      }
      if (req.query.type) filter.type = req.query.type;

      const [conversations, total] = await Promise.all([
        populateContext(
          Conversation.find(filter)
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
        ),
        Conversation.countDocuments(filter),
      ]);

      // Browser cache for fast admin-panel back-navigation (see getAllOrders).
      res.set({
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        Vary: "Cookie",
      });

      return res
        .status(200)
        .json(
          createSuccess(200, "Conversations fetched", {
            conversations,
            pagination: {
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit),
              hasNextPage: page < Math.ceil(total / limit),
              hasPrevPage: page > 1,
            },
          })
        );
    }

    // Customer sees only their own conversations (unchanged, full list)
    const conversations = await populateContext(
      Conversation.find({ customerId: userId }).sort({
        lastMessageAt: -1,
        createdAt: -1,
      })
    );

    return res
      .status(200)
      .json(createSuccess(200, "Conversations fetched", conversations));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. GET SINGLE CONVERSATION
// ==========================================
export const getConversationById = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const conversation = await populateContext(Conversation.findById(conversationId));

    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    // Authorize
    const isCustomer = conversation.customerId._id.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!isCustomer && !isAdmin) {
      return next(createError(401, "Not authorized"));
    }

    return res
      .status(200)
      .json(createSuccess(200, "Conversation fetched", conversation));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. GET MESSAGES (paginated)
// ==========================================
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    // Authorize
    const userId = req.user.id;
    const userRole = req.user.role;
    const isCustomer = conversation.customerId.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!isCustomer && !isAdmin) {
      return next(createError(401, "Not authorized"));
    }

    const messages = await Message.find({ conversationId })
      .populate("senderId", "username email profilePic role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments({ conversationId });

    return res.status(200).json(
      createSuccess(200, "Messages fetched", {
        messages: messages.reverse(), // Return in chronological order
        total,
        page,
        totalPages: Math.ceil(total / limit),
      })
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. SEND MESSAGE (REST fallback)
// ==========================================
export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, text } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!conversationId || !text?.trim()) {
      return next(createError(400, "conversationId and text are required"));
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    // Authorize
    const isCustomer = conversation.customerId.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!isCustomer && !isAdmin) {
      return next(createError(401, "Not authorized"));
    }

    const senderRole = isAdmin ? userRole : "customer";

    const message = await Message.create({
      conversationId,
      senderId: userId,
      senderRole,
      text: text.trim(),
    });

    // Update conversation
    conversation.lastMessage = text.trim();
    conversation.lastMessageAt = new Date();

    if (senderRole === "customer") {
      conversation.unreadCountForAdmin += 1;
    } else {
      conversation.unreadCountForCustomer += 1;
    }
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "username email profilePic role")
      .lean();

    // Publish real-time event via Pusher to the customer + all admin rooms.
    publishChatEvent(conversationId, "new_message", populatedMessage, userId).catch(() => {});

    // If sender is customer, notify all admins (with dedup per admin)
    if (senderRole === "customer") {
      const allAdmins = await Users.find({
        role: { $in: ["admin", "superadmin"] },
      }).select("_id").lean();

      // Fan out to all admins in PARALLEL (the sequential per-admin
      // Notification + push calls made the message response wait for
      // N admins × 2 serialized round-trips). The dedup flag is still set
      // synchronously before any await, so concurrent messages can never
      // double-notify an admin, and everything is still awaited before the
      // response so serverless can't cut it short.
      const notifyPromises = [];
      for (const admin of allAdmins) {
        const adminId = admin._id.toString();
        const offlineKey = `${adminId}:${conversationId}`;
        const alreadyNotified = notifiedOffline.get(offlineKey);

        if (!alreadyNotified) {
          notifiedOffline.set(offlineKey, true);
          notifyPromises.push(
            (async () => {
              try {
                await Notification.create({
                  userId: adminId,
                  title: "New Customer Message",
                  message: text.trim().length > 80
                    ? text.trim().slice(0, 80) + "..."
                    : text.trim(),
                  link: `/Admin/Chats?conversation=${conversationId}`,
                  orderId: conversation.orderId,
                });
              } catch { /* silent */ }

              try {
                await sendPushToUser(adminId, {
                  title: "New customer message",
                  body: text.trim().length > 100
                    ? text.trim().slice(0, 100) + "..."
                    : text.trim(),
                  link: `/Admin/Chats?conversation=${conversationId}`,
                });
              } catch { /* silent */ }
            })()
          );
        }
      }
      await Promise.allSettled(notifyPromises);
    } else {
      // Notify the customer if offline (with dedup)
      const customerId = conversation.customerId.toString();
      const offlineKey = `${customerId}:${conversationId}`;
      const alreadyNotified = notifiedOffline.get(offlineKey);

      if (!alreadyNotified) {
        notifiedOffline.set(offlineKey, true);

        try {
          await Notification.create({
            userId: conversation.customerId,
            title: "New Message from Store",
            message: text.trim().length > 80
              ? text.trim().slice(0, 80) + "..."
              : text.trim(),
            link: conversationLink(conversation),
            orderId: conversation.orderId,
          });
        } catch { /* silent */ }

        try {
          await sendPushToUser(customerId, {
            title: "New message from Store",
            body: text.trim().length > 100
              ? text.trim().slice(0, 100) + "..."
              : text.trim(),
            link: conversationLink(conversation),
          });
        } catch { /* silent */ }
      }
    }

    return res
      .status(201)
      .json(createSuccess(201, "Message sent", populatedMessage));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4b. SEND IMAGE MESSAGE
// ==========================================
export const sendImageMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!conversationId) {
      return next(createError(400, "conversationId is required"));
    }
    if (!req.file) {
      return next(createError(400, "Image file is required"));
    }

    // Enforce allowed formats + 5 MB limit (defense in depth — the
    // multer fileFilter/limits already reject invalid uploads).
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return next(createError(400, "Only JPG, JPEG, PNG, or WEBP images are allowed"));
    }
    if (req.file.size > 5 * 1024 * 1024) {
      return next(createError(400, "Image must be 5 MB or smaller"));
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    // Authorize: customer OR admin/superadmin (same as sendMessage)
    const isCustomer = conversation.customerId.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";
    if (!isCustomer && !isAdmin) {
      return next(createError(401, "Not authorized"));
    }

    const senderRole = isAdmin ? userRole : "customer";

    // Upload image to Cloudinary
    let uploadResult;
    try {
      uploadResult = await uploadToCloudinary(req.file.buffer, "irhasinn/chat");
    } catch (upErr) {
      return next(createError(500, "Image upload failed. Please try again."));
    }

    const message = await Message.create({
      conversationId,
      senderId: userId,
      senderRole,
      type: "image",
      text: "",
      imageUrl: uploadResult.secure_url,
    });

    // Update conversation
    conversation.lastMessage = "📷 Image";
    conversation.lastMessageAt = new Date();

    if (senderRole === "customer") {
      conversation.unreadCountForAdmin += 1;
    } else {
      conversation.unreadCountForCustomer += 1;
    }
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "username email profilePic role")
      .lean();

    // Publish real-time event via Pusher
    publishChatEvent(conversationId, "new_message", populatedMessage, userId).catch(() => {});

    // Offline notifications (same pattern as sendMessage)
    const previewText = "📷 Image";

    if (senderRole === "customer") {
      const allAdmins = await Users.find({
        role: { $in: ["admin", "superadmin"] },
      }).select("_id").lean();

      const notifyPromises = [];
      for (const admin of allAdmins) {
        const adminId = admin._id.toString();
        const offlineKey = `${adminId}:${conversationId}`;
        const alreadyNotified = notifiedOffline.get(offlineKey);

        if (!alreadyNotified) {
          notifiedOffline.set(offlineKey, true);
          notifyPromises.push(
            (async () => {
              try {
                await Notification.create({
                  userId: adminId,
                  title: "New Customer Message",
                  message: previewText,
                  link: `/Admin/Chats?conversation=${conversationId}`,
                  orderId: conversation.orderId,
                });
              } catch { /* silent */ }

              try {
                await sendPushToUser(adminId, {
                  title: "New customer message",
                  body: previewText,
                  link: `/Admin/Chats?conversation=${conversationId}`,
                });
              } catch { /* silent */ }
            })()
          );
        }
      }
      await Promise.allSettled(notifyPromises);
    } else {
      const customerId = conversation.customerId.toString();
      const offlineKey = `${customerId}:${conversationId}`;
      const alreadyNotified = notifiedOffline.get(offlineKey);

      if (!alreadyNotified) {
        notifiedOffline.set(offlineKey, true);

        try {
          await Notification.create({
            userId: conversation.customerId,
            title: "New Message from Store",
            message: previewText,
            link: conversationLink(conversation),
            orderId: conversation.orderId,
          });
        } catch { /* silent */ }

        try {
          await sendPushToUser(customerId, {
            title: "New message from Store",
            body: previewText,
            link: conversationLink(conversation),
          });
        } catch { /* silent */ }
      }
    }

    return res
      .status(201)
      .json(createSuccess(201, "Image message sent", populatedMessage));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. MARK AS READ
// ==========================================
export const markAsRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    const isCustomer = conversation.customerId.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!isCustomer && !isAdmin) {
      return next(createError(401, "Not authorized"));
    }

    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        readAt: null,
      },
      { $set: { readAt: new Date() } }
    );

    // Clear offline-notification flag for this conversation (user has seen the messages)
    notifiedOffline.delete(`${userId}:${conversationId}`);

    if (isCustomer) {
      conversation.unreadCountForCustomer = 0;
    } else {
      conversation.unreadCountForAdmin = 0;
    }
    await conversation.save();

    return res
      .status(200)
      .json(createSuccess(200, "Messages marked as read"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. GET UNREAD COUNT
// ==========================================
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let totalUnread = 0;

    if (userRole === "admin" || userRole === "superadmin") {
      const result = await Conversation.aggregate([
        { $group: { _id: null, total: { $sum: "$unreadCountForAdmin" } } },
      ]);
      totalUnread = result.length > 0 ? result[0].total : 0;
    } else {
      const result = await Conversation.aggregate([
        { $match: { customerId: userId } },
        { $group: { _id: null, total: { $sum: "$unreadCountForCustomer" } } },
      ]);
      totalUnread = result.length > 0 ? result[0].total : 0;
    }

    return res
      .status(200)
      .json(createSuccess(200, "Unread count fetched", { unreadCount: totalUnread }));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 7. GET OR CREATE CONVERSATION BY PRODUCT
// ==========================================
// Opens (or creates) the single product conversation between the customer
// and the store for a given product. One conversation per { customer, product }
// — clicking "Chat About This Product" again reuses the existing conversation
// instead of spawning duplicates (the unique partial index enforces this).
export const getOrCreateByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!mongoose.isValidObjectId(productId)) {
      return next(createError(400, "Invalid product id"));
    }

    // Product must exist (store only the reference — info is fetched live).
    const product = await Product.findById(productId)
      .select("_id name price images")
      .lean();
    if (!product) {
      return next(createError(404, "Product not found"));
    }

    // Customer: their own product conversation (reuse if it exists).
    let conversation = await populateContext(
      Conversation.findOne({ customerId: userId, productId })
    );

    // Admin: can open any existing product conversation.
    if (!conversation && isAdmin) {
      conversation = await populateContext(Conversation.findOne({ productId }));
    }

    if (!conversation && !isAdmin) {
      try {
        conversation = await Conversation.create({
          customerId: userId,
          productId,
          conversationType: "product",
        });
        await conversation.populate(
          "customerId",
          "username email phoneNo profilePic"
        );
        await conversation.populate("productId", "name price images");
        await conversation.populate("orderId", "serialNumber status totalPrice");
      } catch (err) {
        // Duplicate-key race (two clicks creating at once) — reuse the winner.
        if (err?.code === 11000) {
          conversation = await populateContext(
            Conversation.findOne({ customerId: userId, productId })
          );
        } else {
          throw err;
        }
      }
    }

    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    return res
      .status(200)
      .json(createSuccess(200, "Conversation fetched", conversation));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 8. GET OR CREATE CONVERSATION BY ORDER
// ==========================================
// Opens the existing conversation for an order, or creates it on demand for
// legacy orders placed before conversations were auto-created at checkout.
// Security: a customer may only open a conversation for an order they OWN —
// the order's `user` is verified server-side before any creation. Admins can
// open any order conversation (find-only).
export const getOrCreateByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!mongoose.isValidObjectId(orderId)) {
      return next(createError(400, "Invalid order id"));
    }

    let conversation = await populateContext(
      Conversation.findOne({ customerId: userId, orderId })
    );

    if (!conversation && isAdmin) {
      // Admin can fetch any conversation by orderId
      conversation = await populateContext(Conversation.findOne({ orderId }));
    }

    if (!conversation && !isAdmin) {
      // Legacy order without a conversation yet — verify ownership first.
      const order = await Order.findById(orderId).select("_id user").lean();
      if (!order) {
        return next(createError(404, "Order not found"));
      }
      if (String(order.user) !== String(userId)) {
        return next(
          createError(403, "You can only chat about your own orders")
        );
      }
      try {
        conversation = await Conversation.create({
          customerId: userId,
          orderId,
          conversationType: "order",
        });
        await conversation.populate(
          "customerId",
          "username email phoneNo profilePic"
        );
        await conversation.populate("orderId", "serialNumber status totalPrice");
        await conversation.populate("productId", "name price images");
      } catch (err) {
        // Duplicate-key race — reuse the conversation another request created.
        if (err?.code === 11000) {
          conversation = await populateContext(
            Conversation.findOne({ customerId: userId, orderId })
          );
        } else {
          throw err;
        }
      }
    }

    if (!conversation) {
      return next(createError(404, "Conversation not found"));
    }

    return res
      .status(200)
      .json(createSuccess(200, "Conversation fetched", conversation));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 8. START DIRECT CONVERSATION (ADMIN) — Online Users page
// ==========================================
// Creates (or reuses) an order-less "direct" conversation between the
// requesting admin and a target user, then returns the conversation ID
// so the frontend can deep-link into Admin/Chats.
export const startDirectConversation = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    const adminId = req.user.id;

    if (!targetUserId) {
      return next(createError(400, "targetUserId is required"));
    }

    if (String(targetUserId) === String(adminId)) {
      return next(createError(400, "Cannot start a conversation with yourself"));
    }

    const targetUser = await Users.findById(targetUserId).select("_id").lean();
    if (!targetUser) {
      return next(createError(404, "User not found"));
    }

    // Reuse an existing direct conversation if one exists.
    let conversation = await Conversation.findOne({
      customerId: targetUserId,
      ...DIRECT_CONV_QUERY,
    })
      .populate("customerId", "username email phoneNo profilePic")
      .populate("orderId", "serialNumber status totalPrice")
      .sort({ lastMessageAt: -1, createdAt: -1 });

    if (!conversation) {
      try {
        conversation = await Conversation.create({
          customerId: targetUserId,
          conversationType: "general",
          // orderId / productId intentionally omitted — direct (context-less)
          // conversation started by an admin from the Online Users page.
        });
        await conversation.populate("customerId", "username email phoneNo profilePic");
      } catch (err) {
        // Gracefully handle a duplicate-key race (e.g. if the legacy
        // non-partial unique index is still present in the DB): fall back
        // to fetching the conversation that another request just created.
        if (err?.code === 11000) {
          conversation = await Conversation.findOne({
            customerId: targetUserId,
            ...DIRECT_CONV_QUERY,
          })
            .populate("customerId", "username email phoneNo profilePic")
            .populate("orderId", "serialNumber status totalPrice");
        } else {
          throw err;
        }
      }
    }

    return res
      .status(200)
      .json(
        createSuccess(200, "Direct conversation ready", {
          conversationId: conversation._id,
          conversation,
        })
      );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 9. DELETE CONVERSATION (SUPERADMIN ONLY)
// ==========================================

/**
 * Shared deletion helper — removes the given conversations AND all their
 * associated Message documents (so no orphaned messages remain in the DB).
 * Used by both the single-conversation delete and the bulk delete endpoint.
 * Returns the number of conversations actually deleted.
 */
const deleteConversationsByIds = async (ids) => {
  const idList = Array.isArray(ids) ? ids : [ids];
  if (idList.length === 0) return 0;

  const result = await Conversation.deleteMany({ _id: { $in: idList } });
  if (result.deletedCount === 0) return 0;

  // Remove all messages so no orphaned documents remain in the DB.
  await Message.deleteMany({ conversationId: { $in: idList } });
  return result.deletedCount;
};

export const deleteConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const deletedCount = await deleteConversationsByIds([conversationId]);
    if (deletedCount === 0) {
      return next(createError(404, "Conversation not found"));
    }

    return res
      .status(200)
      .json(createSuccess(200, "Conversation deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 10. BULK DELETE CONVERSATIONS (SUPERADMIN ONLY)
// ==========================================
export const bulkDeleteConversations = async (req, res, next) => {
  try {
    const { conversationIds } = req.body;

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return next(createError(400, "conversationIds array is required"));
    }

    if (!conversationIds.every((id) => mongoose.isValidObjectId(id))) {
      return next(createError(400, "conversationIds contains an invalid conversation id"));
    }

    const deletedCount = await deleteConversationsByIds(conversationIds);

    return res.status(200).json(
      createSuccess(200, `${deletedCount} conversation(s) deleted`, {
        deletedCount,
      })
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 11. SEND TYPING INDICATOR
// ==========================================
// Lightweight endpoint: validates the conversation exists and the user
// is a participant, then broadcasts a user_typing event via Pusher.
// The frontend debounces calls to this endpoint (typically every 2-3s
// while the user is actively typing) to stay within Pusher rate limits.
export const sendTypingIndicator = async (req, res, next) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!conversationId) {
      return res.status(200).json(createSuccess(200, "OK")); // no-op if missing
    }

    const conversation = await Conversation.findById(conversationId)
      .select("customerId")
      .lean();
    if (!conversation) {
      return res.status(200).json(createSuccess(200, "OK")); // no-op if gone
    }

    const isCustomer = conversation.customerId?.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";
    if (!isCustomer && !isAdmin) {
      return res.status(200).json(createSuccess(200, "OK")); // no-op if unauthorized
    }

    // Broadcast to all participants in this conversation (skip sender)
    const recipientIds = [];
    if (isCustomer) {
      // Customer typing → notify all admins
      const admins = await Users.find({ role: { $in: ["admin", "superadmin"] } })
        .select("_id")
        .lean();
      admins.forEach((a) => recipientIds.push(a._id.toString()));
    } else {
      // Admin typing → notify the customer
      recipientIds.push(conversation.customerId.toString());
    }

    if (recipientIds.length > 0) {
      await publishToUsers(recipientIds, "user_typing", {
        conversationId,
        userId,
      });
    }

    return res.status(200).json(createSuccess(200, "OK"));
  } catch (error) {
    // Non-critical — typing indicators are best-effort
    return res.status(200).json(createSuccess(200, "OK"));
  }
};
