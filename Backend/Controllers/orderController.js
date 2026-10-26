import { Order } from "../Models/Orders.js";
import { Product } from "../Models/Product.js";
import { Settings } from "../Models/Settings.js";
import Users from "../Models/Users.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import {
  validateStatusTransition,
  canChangeDeliveryLocation,
} from "../utils/roleHelpers.js";
import { validateShippingAddressInput } from "../utils/orderAddressValidation.js";
import {
  calculateOrderShipping,
  normalizeShippingSettings,
  normalizeCityName,
  evaluateCityShippingChange,
} from "../utils/shipping.js";
import { redisClient, isRedisReady } from "../utils/redisClient.js";
import { debugLog } from "../utils/debugLog.js";
import { sendEmail } from "../utils/sendEmail.js";
import { Notification } from "../Models/Notification.js";
import { Conversation } from "../Models/Conversation.js";
import {
  notifyOrderStatusChange,
  notifyOrderLocationChanged,
  broadcastTrackingEvent,
  generateTrackingNumber,
} from "../utils/orderTrackingHelpers.js";
import {
  invalidateProductListings,
  invalidateProductDetail,
} from "../utils/redisCache.js";
import { runAfterResponse } from "../utils/afterResponse.js";
import {
  hasVariantInventory,
  getEffectiveStock,
  getVariantStock,
  isProductInStock,
  resolveVariantKey,
} from "../utils/inventory.js";

const populateOrder = (query) =>
  query
    .populate("user", "username email phoneNo profilePic")
    .populate({
      path: "orderItems.product",
      select: "name slug price images stock description category brand customizable showCustomizationPreview customizationFields printLayout",
      populate: {
        path: "category",
        select: "name",
      },
    });

// Helper: Assign serial numbers to old orders missing them.
// Runs at most ONCE per server process (with a shared in-flight promise so
// concurrent list requests share a single run and can never collide on the
// unique serialNumber index). Serial numbers are only ever missing on LEGACY
// orders — new orders always receive one at creation — so after one successful
// pass there is nothing left to scan; previously this re-ran a collection
// scan on EVERY getMyOrders / getAllOrders request. A backfill failure still
// rejects the caller exactly as before and is retried on the next request.
let serialBackfillDone = false;
let serialBackfillPromise = null;
const assignMissingSerialNumbers = async () => {
  if (serialBackfillDone) return;
  if (!serialBackfillPromise) {
    serialBackfillPromise = (async () => {
      const ordersWithoutSerial = await Order.find({ serialNumber: { $exists: false } }).sort({ createdAt: 1 });
      if (ordersWithoutSerial.length > 0) {
        const lastOrder = await Order.findOne({ serialNumber: { $exists: true } }).sort({ serialNumber: -1 });
        let currentSerial = lastOrder ? lastOrder.serialNumber : 1000;

        for (const order of ordersWithoutSerial) {
          currentSerial++;
          order.serialNumber = currentSerial;
          await order.save({ validateBeforeSave: false });
        }
        debugLog(`[Migration] Assigned serial numbers to ${ordersWithoutSerial.length} old orders`);
      }
      serialBackfillDone = true;
    })().finally(() => {
      serialBackfillPromise = null;
    });
  }
  return serialBackfillPromise;
};

// ==========================================
// STOCK RESTORATION (idempotent — exactly once)
// ==========================================
// Restores inventory for a cancelled/deleted order by incrementing product
// stock and decrementing the sold counter. The `inventoryRestored` flag is
// claimed ATOMICALLY (findOneAndUpdate with a condition) before any stock
// moves, so concurrent requests (customer cancel + admin delete racing, or a
// duplicated status update) can NEVER restore the same order twice — only the
// process that wins the claim touches stock. Fire-and-forget per item via
// Promise.allSettled so a missing/deleted product never blocks the rest.
const restoreOrderStock = async (order) => {
  if (!order || !order._id || !Array.isArray(order.orderItems) || order.orderItems.length === 0) {
    return;
  }
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, inventoryRestored: { $ne: true } },
    { $set: { inventoryRestored: true, inventoryRestoredAt: new Date() } },
    { new: true }
  );
  if (!claimed) return; // already restored (or being restored) — never restore twice

  await Promise.allSettled(
    claimed.orderItems.map(async (item) => {
      // Restore the product-level stock
      const product = await Product.findById(item.product);
      if (!product) return;

      if (hasVariantInventory(product)) {
        // Restore variant-level stock: resolve the real stored key from the order
        // item's selectedColor + selectedSize, then increment that variant.
        const color = (item.selectedColor || "").trim();
        const size = (item.selectedSize || "").trim();
        const variantKey = resolveVariantKey(product, color, size);
        const updateOps = { $inc: { sold: -item.quantity } };
        if (variantKey && product.variantStock && product.variantStock[variantKey] !== undefined) {
          updateOps.$inc[`variantStock.${variantKey}`] = item.quantity;
        }
        // Also update the derived main stock from the updated variant totals
        await Product.findByIdAndUpdate(item.product, updateOps);
        // Re-read to sync main stock
        const refreshed = await Product.findById(item.product);
        if (refreshed) {
          const totalVariant = Object.values(refreshed.variantStock || {}).reduce(
            (sum, v) => sum + (Number(v) || 0), 0
          );
          refreshed.stock = totalVariant;
          await refreshed.save({ validateBeforeSave: false });
        }
      } else {
        // Normal product: just increment main stock
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity, sold: -item.quantity },
        });
      }
    })
  );
  // Restored inventory can re-list previously out-of-stock items — never
  // let cached listings or product-detail payloads show stale availability.
  await invalidateProductListings();
  await Promise.allSettled(
    claimed.orderItems.map((item) =>
      invalidateProductDetail(item.product)
    )
  );
  console.warn(
    `[Order] Stock restored for order ${claimed._id} (${claimed.orderItems.length} item(s))`
  );
};

// ==========================================
// 1. CREATE ORDER
// ==========================================
export const createOrder = async (req, res, next) => {
  // Track stock decrements applied BEFORE order creation so the catch block can
  // roll them back if order creation (or anything after it) fails. Declared at
  // function scope so the catch block can read them.
  const stockDecrements = [];
  let orderCreated = false;
  // Wallet-rollback state is hoisted to function scope so the catch block can
  // read it. (It was previously declared inside the try, so ANY thrown error
  // hit a ReferenceError here that replaced the real error with a bogus 500
  // and masked the actual failure reason.)
  let walletRedemptionAmount = 0;
  let walletTxnId = null;
  let walletReserved = null;
  // Same hoisting reason: the catch block reads idempotencyKey to handle the
  // concurrent-duplicate-submission replay (it was destructured inside the
  // try, so the catch always crashed with a ReferenceError and the idempotent
  // replay path could never actually run).
  let idempotencyKey;

  // Restores previously-decremented stock when a later step fails (e.g. order
  // creation). Promise.allSettled keeps a partial rollback from throwing.
  const rollbackStock = async (decrements) => {
    if (!decrements.length) return;
    await Promise.allSettled(
      decrements.map(async ({ productId, qty, item }) => {
        const product = await Product.findById(productId);
        if (!product) return;
        if (hasVariantInventory(product) && item) {
          // Rollback variant stock
          const color = (item.selectedColor || "").trim();
          const size = (item.selectedSize || "").trim();
          const variantKey = resolveVariantKey(product, color, size);
          const variantField = `variantStock.${variantKey}`;
          await Product.findByIdAndUpdate(productId, {
            $inc: { [variantField]: qty, sold: -qty },
          });
          // Re-sync main stock
          const refreshed = await Product.findById(productId);
          if (refreshed) {
            const totalVariant = Object.values(refreshed.variantStock || {}).reduce(
              (sum, v) => sum + (Number(v) || 0), 0
            );
            refreshed.stock = totalVariant;
            await refreshed.save({ validateBeforeSave: false });
          }
        } else {
          // Rollback main stock
          await Product.findByIdAndUpdate(productId, {
            $inc: { stock: qty, sold: -qty },
          });
        }
      })
    );
    console.warn(
      "[Order] Stock rolled back for",
      decrements.length,
      "items due to order failure"
    );
  };

  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      orderType,
      referralCode,
      walletRedeemAmount,
      idempotencyKey: bodyIdempotencyKey,
    } = req.body;
    idempotencyKey = bodyIdempotencyKey;

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return next(createError(400, "Order items are required"));
    }

    if (!shippingAddress || typeof shippingAddress !== "object") {
      return next(createError(400, "Shipping address is required"));
    }

    // ─── Server-side shipping validation: never trust client-provided address
    // fields or shipping figures. Required fields are enforced, optional GPS
    // coordinates are range-checked, and the shipping price is coerced to a
    // finite, non-negative number (a negative value can never reduce the
    // order total). ───
    // The rule set itself lives in utils/orderAddressValidation.js so the
    // customer "change delivery location" endpoint (updateOrderLocation)
    // enforces the EXACT same requirements — one source of truth, never a
    // second, slowly-drifting copy of the policy. Behaviour (fields required,
    // PK phone format, city/country fallbacks, GPS range checks and every
    // error string) is byte-for-byte identical to the previous inline block.
    const addressResult = validateShippingAddressInput(shippingAddress);
    if (!addressResult.ok) {
      return next(createError(400, addressResult.error));
    }
    const safeShippingAddress = addressResult.value;


    // ─── Checkout idempotency: a replayed submission with the same key (double
    // click, refresh during submit, or a client retry after a lost response)
    // returns the original order INSTEAD of creating a duplicate — which also
    // guarantees the wallet is never debited twice and a referral reward is
    // never reserved twice for the same checkout. The unique sparse index on
    // Order.idempotencyKey closes the concurrent double-submit race. ───
    if (idempotencyKey && typeof idempotencyKey === "string") {
      const existingOrder = await Order.findOne({
        idempotencyKey,
        user: req.user.id,
      });
      if (existingOrder) {
        return res
          .status(201)
          .json(createSuccess(201, "Order created successfully", existingOrder));
      }
    }

    // Validate items, stock availability, and compute the AUTHORITATIVE item
    // prices from MongoDB. Client-supplied prices are ignored entirely — the
    // order total is derived from Product.price × quantity below.
    const validatedOrderItems = [];
    let serverItemsPrice = 0;
    try {
      // Pass 1 (no DB): shape validation only, in request order. The quantity
      // check stays in Pass 3 so mixed malformed requests produce the EXACT
      // same 400 as the original per-item findById loop (each item was fully
      // validated — shape, qty, product — before the next one was processed).
      const pendingItems = [];
      for (const item of orderItems) {
        if (!item || !item.product) {
          return next(createError(400, "Each order item must reference a product"));
        }
        pendingItems.push(item);
      }

      // Pass 2: fetch every referenced product in ONE query (N+1 → 1). A
      // malformed id still throws the same CastError → clean 400 below.
      const productIds = [...new Set(pendingItems.map((item) => String(item.product)))];
      const products = await Product.find({ _id: { $in: productIds } }).select(
        "price name stock images printLayout freeShipping shippingCharge variantPricing variantStock sizes colors"
      );
      const productById = new Map(products.map((p) => [String(p._id), p]));

      // Pass 3: resolve in request order with the exact same rules/messages.
      for (const item of pendingItems) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
          return next(createError(400, "Invalid quantity for a cart item"));
        }
        // Always price items from MongoDB — client-supplied prices are ignored
        // entirely. The fetched document is reused for the stock check/save
        // below. `images` is selected so the price/name/image snapshot can be
        // stored on the order item (invoices keep the price paid even if the
        // product price changes later).
        const dbProduct = productById.get(String(item.product));
        if (!dbProduct) {
          return next(createError(400, `Product not found: ${item.product}`));
        }
        // Variant-aware stock validation: for variant-managed products,
        // validate the exact selected variant's stock, not the main stock.
        const itemColor = (item.selectedColor || "").trim();
        const itemSize = (item.selectedSize || "").trim();
        if (hasVariantInventory(dbProduct)) {
          const variantAvail = getVariantStock(dbProduct, itemColor, itemSize);
          if (variantAvail < quantity) {
            return next(createError(400, `Product ${dbProduct.name} has only ${variantAvail} items in stock for the selected variant`));
          }
        } else {
          if (dbProduct.stock < quantity) {
            return next(createError(400, `Product ${dbProduct.name} has only ${dbProduct.stock} items in stock`));
          }
        }

        // ── Variant-aware pricing: resolve the exact price from the
        // variantPricing map when available, falling back to the base price.
        let resolvedPrice = Number(dbProduct.price || 0);
        if (dbProduct.variantPricing && typeof dbProduct.variantPricing === "object") {
          const color = (item.selectedColor || "").trim();
          const size = (item.selectedSize || "").trim();
          // Key format: "Color__Size" or just "Size" (no color)
          const colorSizeKey = color && size ? `${color}__${size}` : "";
          const sizeOnlyKey = size || "";
          if (colorSizeKey && dbProduct.variantPricing[colorSizeKey] !== undefined) {
            resolvedPrice = Math.max(0, Number(dbProduct.variantPricing[colorSizeKey]) || resolvedPrice);
          } else if (sizeOnlyKey && dbProduct.variantPricing[sizeOnlyKey] !== undefined) {
            resolvedPrice = Math.max(0, Number(dbProduct.variantPricing[sizeOnlyKey]) || resolvedPrice);
          }
        }
        serverItemsPrice += resolvedPrice * quantity;
        validatedOrderItems.push({ item, product: dbProduct, quantity, resolvedPrice });
      }
    } catch (fetchErr) {
      // Missing / malformed product id (e.g. CastError) — clean 400
      return next(createError(400, `Product not found: ${fetchErr?.value || "invalid product id"}`));
    }

    // Round to 2 decimal places to avoid floating-point drift
    serverItemsPrice = Math.round(serverItemsPrice * 100) / 100;

    // ─── Shipping cost (authoritative, server-side) ───
    // Same rules as the storefront display (Frontend/src/app/utils/shipping.ts)
    // — never trust the client's shippingPrice figure:
    //  1. Any item with the per-product freeShipping flag → order ships free.
    //  2. Subtotal at/above the admin free-shipping threshold (feature
    //     enabled) → order ships free.
    //  3. Otherwise → the configured base shipping fee applies.
    // ─── Run independent operations in parallel ───
    // Settings fetch and serial number generation are independent and can
    // run concurrently, saving one DB round-trip.
    const [settingsDoc, serialNumber] = await Promise.all([
      // Settings fetch (for shipping calculation) — fail-safe
      Settings.findOne({ key: "store" }).lean().catch(() => null),
      // Serial number generation — atomic via Redis INCR to prevent
      // concurrent double-serial collisions. Falls back to DB max when
      // Redis is unavailable (same behavior as before).
      (async () => {
        const SERIAL_KEY = "order:serial:next";
        if (isRedisReady()) {
          try {
            const next = await redisClient.incr(SERIAL_KEY);
            // Initialize the counter on first run (if it doesn't exist yet)
            if (next === 1) {
              const lastOrder = await Order.findOne({
                serialNumber: { $exists: true, $ne: null },
              }).sort({ serialNumber: -1 }).select("serialNumber").lean();
              const maxSerial = lastOrder && typeof lastOrder.serialNumber === "number"
                ? lastOrder.serialNumber : 1000;
              await redisClient.set(SERIAL_KEY, maxSerial + 1);
              return maxSerial + 1;
            }
            return next;
          } catch (redisErr) {
            debugLog(`[Serial] Redis INCR failed, falling back to DB:`, redisErr.message);
          }
        }
        // Fallback: DB read (same as original)
        const lastOrder = await Order.findOne({
          serialNumber: { $exists: true, $ne: null },
        }).sort({ serialNumber: -1 }).select("serialNumber").lean();
        return lastOrder && typeof lastOrder.serialNumber === "number"
          ? lastOrder.serialNumber + 1
          : 1001;
      })(),
    ]);
    const shippingSettings = normalizeShippingSettings(settingsDoc);
    /*
     * Shipping precedence + the city-wise lookup live in utils/shipping.js so
     * the storefront estimate, order creation, and the change-location
     * recalculation can never drift apart. The city name is normalized on BOTH
     * sides of the comparison there — see that module's header for why the
     * previous one-sided comparison silently fell through to the flat fee.
     */
    const { shipping: safeShippingPrice } = calculateOrderShipping({
      items: validatedOrderItems.map(({ product }) => ({
        freeShipping: product.freeShipping,
        shippingCharge: product.shippingCharge,
      })),
      subtotal: serverItemsPrice,
      settings: shippingSettings,
      city: safeShippingAddress.city,
    });

    // ─── Serial number generation ───
    // Reads the max existing serial and takes the next value. The unique sparse
    // Serial number was generated in the parallel block above.
    let trackingNumber = generateTrackingNumber(serialNumber);

    // ─── Referral code validation (additive — fully skipped when absent) ───
    let appliedReferralCode = null;
    let appliedReferrerId = null;
    if (referralCode && String(referralCode).trim()) {
      const { validateReferralCodeLogic } = await import("../utils/referralService.js");
      const shippingPhone = safeShippingAddress.phoneNo;
      const referralResult = await validateReferralCodeLogic(referralCode, req.user.id, shippingPhone);
      if (!referralResult.valid) {
        return next(createError(400, referralResult.reason));
      }
      appliedReferralCode = referralResult.referral.code;
      appliedReferrerId = referralResult.referral.userId;
    }

    // ─── Referral wallet redemption (reserve → confirm / rollback) ───
    if (walletRedeemAmount && Number(walletRedeemAmount) > 0) {
      const { reserveWalletRedemption } = await import("../utils/referralService.js");
      const reserved = await reserveWalletRedemption(req.user.id, Number(walletRedeemAmount), {
        itemsPrice: serverItemsPrice,
        shippingPrice: safeShippingPrice,
        discountAmount: 0,
      });
      if (!reserved.ok) {
        return next(createError(400, reserved.reason || "Referral wallet cannot be applied"));
      }
      walletRedemptionAmount = reserved.amount;
      walletTxnId = reserved.transaction ? reserved.transaction._id : null;
      walletReserved = reserved;
    }

    // Recalculate totalPrice with wallet redemption
    // (never trust the frontend's totalPrice — items are priced from MongoDB,
    // shipping is recomputed server-side, wallet amounts are server-validated)
    const calculatedTotal = Math.max(
      0,
      Math.round((serverItemsPrice + safeShippingPrice - walletRedemptionAmount) * 100) / 100
    );

    // ─── Atomic stock decrement (BEFORE order creation) ───
    // Two concurrent orders can both pass the availability check above and then
    // read the same stock value, so a plain read-modify-save can oversell. Each
    // decrement is an atomic findOneAndUpdate that checks stock >= qty and
    // decrements in the same operation — only ONE racing order wins. Because
    // this runs BEFORE Order.create(), a checkout that fails on stock never
    // leaves an orphaned order; decrements already applied are rolled back.
    for (const { product, quantity, item } of validatedOrderItems) {
      const itemColor = (item.selectedColor || "").trim();
      const itemSize = (item.selectedSize || "").trim();

      if (hasVariantInventory(product)) {
        // ── Variant-managed product: atomically decrement the specific variant.
        // Resolve the REAL stored key (handles whitespace / case mismatches
        // between what the frontend sent and what was saved in the DB).
        const variantKey = resolveVariantKey(product, itemColor, itemSize);
        const variantField = `variantStock.${variantKey}`;

        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: product._id,
            [variantField]: { $gte: quantity },
          },
          {
            $inc: {
              [variantField]: -quantity,
              sold: quantity,
            },
          },
          { new: true }
        );

        if (!updatedProduct) {
          await rollbackStock(stockDecrements);
          stockDecrements.length = 0;
          const check = await Product.findById(product._id).select("name variantStock").lean();
          if (!check) {
            throw createError(404, `Product not found: ${product._id}`);
          }
          const currentVariant = check.variantStock?.[variantKey] || 0;
          throw createError(
            400,
            `Insufficient stock for "${check.name}" (${variantKey}). Available: ${currentVariant}, Requested: ${quantity}`
          );
        }

        // Sync the derived main stock from the updated variant totals
        const totalVariant = Object.values(updatedProduct.variantStock || {}).reduce(
          (sum, v) => sum + (Number(v) || 0), 0
        );
        await Product.findByIdAndUpdate(product._id, { stock: totalVariant }, { validateBeforeSave: false });
      } else {
        // ── Normal product: atomically decrement main stock.
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: product._id, stock: { $gte: quantity } },
          { $inc: { stock: -quantity, sold: quantity } },
          { new: true }
        );

        if (!updatedProduct) {
          await rollbackStock(stockDecrements);
          stockDecrements.length = 0;
          const check = await Product.findById(product._id)
            .select("stock name")
            .lean();
          if (!check) {
            throw createError(404, `Product not found: ${product._id}`);
          }
          throw createError(
            400,
            `Insufficient stock for "${check.name}". Available: ${check.stock}, Requested: ${quantity}`
          );
        }
      }

      stockDecrements.push({ productId: product._id, qty: quantity, item });
    }

    const orderData = {
      serialNumber,
      trackingNumber,
      idempotencyKey: idempotencyKey || undefined,
      user: req.user.id,
      orderType: orderType === "bulk" ? "bulk" : "normal",
      orderItems: validatedOrderItems.map(({ item, product, quantity, resolvedPrice }) => {
        const snapshotPrice = resolvedPrice != null ? resolvedPrice : Number(product.price || 0);
        return {
          product: item.product,
          quantity,
          // ── Price snapshot: stores the price at time of purchase so invoices,
          // order history and analytics keep showing the ORIGINAL price even if
          // the product price changes later. Old orders fall back to the
          // populated product price. ──
          unitPrice: snapshotPrice,
          totalItemPrice:
            Math.round(snapshotPrice * quantity * 100) / 100,
          productName: product.name || "",
          productImage: product.images?.[0]?.url || "",
          // ── Print-layout snapshot: past orders must never visually change,
          // even if the product's layout is re-detected or its image swapped
          // later. Order pages render item.printLayout FIRST, falling back to
          // the product's live layout only for pre-snapshot orders. ──
          printLayout: product.printLayout || null,
          renderVersion: "v2",
          previewMetadata: {
            sourceImage: product.images?.[0]?.url || "",
            detectedAt: product.printLayout?.detectedAt || null,
            capturedAt: new Date().toISOString(),
          },
          selectedColor: item.selectedColor || "",
          selectedSize: item.selectedSize || "",
          customizationAnswers: item.customizationAnswers || [],
        };
      }),
      shippingAddress: safeShippingAddress,
      paymentMethod,
      // Payment gateway not integrated; status set server-side only
      paymentStatus: "pending",
      itemsPrice: serverItemsPrice,
      shippingPrice: safeShippingPrice,
      totalPrice: calculatedTotal,
      referralCode: appliedReferralCode,
      referrerId: appliedReferrerId,
      walletRedemptionAmount,
      walletTransactionId: walletTxnId,
      status: "Pending",
      trackingHistory: [{ status: "Pending", timestamp: new Date() }],
    };

    let order;
    try {
      order = await Order.create(orderData);
    } catch (serialErr) {
      // Two concurrent orders read the same last serial → the unique sparse
      // index rejected this save. Bump the serial (+ random jitter) and retry
      // once so the checkout succeeds instead of surfacing a 500. This branch
      // is keyed by keyPattern.serialNumber so it never swallows the idempotency
      // replay handling (keyPattern.idempotencyKey) in the outer catch below.
      if (
        serialErr?.code === 11000 &&
        serialErr?.keyPattern?.serialNumber
      ) {
        serialNumber = serialNumber + Math.floor(Math.random() * 10) + 1;
        trackingNumber = generateTrackingNumber(serialNumber);
        orderData.serialNumber = serialNumber;
        orderData.trackingNumber = trackingNumber;
        order = await Order.create(orderData);
      } else {
        throw serialErr;
      }
    }

    // Order persisted — a later failure must NOT roll stock back anymore.
    orderCreated = true;

    // Stock was decremented for every item — cached product listings AND the
    // per-product detail payloads must not keep showing sold-out items as
    // available (best-effort, additive).
    await invalidateProductListings();
    await Promise.allSettled(
      validatedOrderItems.map(({ product }) =>
        invalidateProductDetail(product._id),
      ),
    );

    // Link the wallet reservation to the created order
    if (walletReserved?.transaction) {
      try {
        const { WalletTransaction } = await import("../Models/WalletTransaction.js");
        await WalletTransaction.updateOne(
          { _id: walletReserved.transaction._id, orderId: null },
          { $set: { orderId: order._id, note: `Applied towards order ${serialNumber}` } }
        );
      } catch (linkErr) {
        console.error("[Referral] Wallet txn link failed:", linkErr.message || linkErr);
      }
    }
    
    await Users.findByIdAndUpdate(req.user.id, { cart: [] });

    debugLog(`[Order Created]: ${order._id} for user ${req.user.id}`);

    // ─── Generate and email invoice (DEFERRED, serverless-safe) ───
    // The invoice PDF + confirmation email are NOT on the user-facing
    // critical path: the order is already created and persisted above, so
    // the response must not wait on pdfkit + Gmail SMTP (which routinely
    // added 1–3s to every checkout). runAfterResponse() uses Vercel's
    // waitUntil() to keep the function instance alive until the work
    // settles (bounded by maxDuration in vercel.json) — NOT a detached
    // promise that can be frozen/evicted. Locally it falls back to
    // setImmediate, and the helper swallows + logs its own errors, so an
    // email failure can never fail the order.
    runAfterResponse(() => generateAndEmailInvoice(order._id), "order-invoice");

    // ─── Auto-create conversation for order (DEFERRED — non-critical) ───
    // The order is already persisted above; the chat thread is ancillary UX,
    // not part of the order's transactional success. Moving it off the
    // response path removes one DB read + one DB write from user-visible
    // checkout latency. runAfterResponse() keeps the function instance alive
    // (waitUntil) until the work settles, and a failure is caught + logged
    // here — it can never mark a successful order as failed. Customers who
    // immediately open "Chat About This Order" are covered by the chat
    // controller's find-or-create behavior on the order route.
    runAfterResponse(async () => {
      try {
        const existing = await Conversation.findOne({
          customerId: req.user.id,
          orderId: order._id,
        });
        if (!existing) {
          await Conversation.create({
            orderId: order._id,
            customerId: req.user.id,
            conversationType: "order",
          });
          debugLog(`[Chat] Conversation auto-created for order ${order._id}`);
        }
      } catch (convErr) {
        console.error(`[Chat] Failed to create conversation for order ${order._id}:`, convErr.message || convErr);
      }
    }, "order-conversation");

    // ─── Referral reward (pending) + first-time unlock detection ───
    let referralUnlocked = null;
    try {
      const {
        createPendingReward,
        ensureReferralForUser,
        notifyUser,
      } = await import("../utils/referralService.js");

      // Pending-reward creation is a non-critical side effect — run it after
      // the response (serverless-safe via waitUntil). Referral business rules
      // are unchanged; only the timing moves.
      if (appliedReferrerId && appliedReferralCode) {
        runAfterResponse(
          () =>
            createPendingReward(order).catch((rewardErr) => {
              console.error(
                `[Referral] Pending reward create failed for order ${order._id}:`,
                rewardErr.message || rewardErr,
              );
            }),
          "order-reward",
        );
      }

      // If this user crossed the eligibility threshold on earlier DELIVERED
      // orders, generate + return their code so checkout can show the popup.
      // This feeds the response payload (referralUnlocked), so it stays on
      // the critical path.
      const unlock = await ensureReferralForUser(req.user.id);
      if (unlock.unlocked) {
        referralUnlocked = {
          code: unlock.referral.code,
          message: "You unlocked your exclusive referral code!",
        };
      }
      // In-app notification that wallet funds were applied — non-critical,
      // deferred the same way as the other notifications.
      if (walletRedemptionAmount > 0) {
        runAfterResponse(
          () =>
            notifyUser(req.user.id, {
              title: "💳 Referral Wallet Applied",
              message: `Rs ${walletRedemptionAmount.toLocaleString()} from your referral wallet was applied to order ${serialNumber}.`,
              link: `/profile/orders/${order._id}`,
            }).catch((notifyErr) => {
              console.error(
                "[Referral] Wallet-applied notify failed:",
                notifyErr.message || notifyErr,
              );
            }),
          "order-wallet-notify",
        );
      }
    } catch (referralErr) {
      // Referral logic must never block order success
      console.error("[Referral] Checkout hook error:", referralErr.message || referralErr);
    }

    const orderPayload =
      typeof order.toObject === "function" ? order.toObject() : { ...order };
    if (referralUnlocked) orderPayload.referralUnlocked = referralUnlocked;

    return res
      .status(201)
      .json(createSuccess(201, "Order created successfully", orderPayload));
  } catch (error) {
    // Roll back stock decrements if the order was never created — stock is now
    // decremented BEFORE Order.create(), so a failed checkout must undo it.
    if (stockDecrements?.length && !orderCreated) {
      await rollbackStock(stockDecrements);
    }

    // Roll back any wallet reservation if the order failed after debiting
    if (walletReserved?.transaction && walletReserved.amount > 0) {
      try {
        const { releaseWalletRedemption } = await import("../utils/referralService.js");
        await releaseWalletRedemption(req.user.id, walletReserved.amount, walletReserved.transaction._id);
      } catch (releaseErr) {
        console.error("[Referral] Wallet reservation rollback failed:", releaseErr.message || releaseErr);
      }
    }

    // Concurrent duplicate submission with the same idempotency key: the unique
    // index rejected this attempt AFTER it passed the early replay check. This
    // attempt's wallet reservation was already rolled back above — return the
    // order the winning request created so the client sees a clean success.
    if (
      error &&
      error.code === 11000 &&
      idempotencyKey &&
      error.keyPattern &&
      error.keyPattern.idempotencyKey
    ) {
      try {
        const existing = await Order.findOne({
          idempotencyKey,
          user: req.user.id,
        });
        if (existing) {
          return res
            .status(201)
            .json(createSuccess(201, "Order created successfully", existing));
        }
      } catch (dupErr) {
        console.error("[Order] Idempotent replay lookup failed:", dupErr.message || dupErr);
      }
    }

    next(error);
  }
};

// ==========================================
// 2. GET LOGGED IN USER ORDERS
// ==========================================
export const getMyOrders = async (req, res, next) => {
  try {
    debugLog(`[Order Route]: Fetching orders for user ${req.user.id}`);

    await assignMissingSerialNumbers();

    // Backward-compatible pagination: existing consumers (OrderTrackingWidget,
    // profile/orders page) call without page/limit and receive the SAME array
    // they always did. When page or limit IS supplied, the response uses the
    // { orders, pagination } object — the exact admin getAllOrders pattern —
    // so bounded reads are possible without breaking any current consumer.
    // Clamped like referralController.getReferralHistory so malformed inputs
    // (e.g. page=-1 or limit=0) can never reach mongoose .skip()/.limit() and
    // produce a 500 — they fall back to a safe bounded read instead.
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const hasPagination =
      req.query.page !== undefined || req.query.limit !== undefined;

    const baseQuery = () =>
      Order.find({ user: req.user.id }).sort({ createdAt: -1 });

    if (hasPagination) {
      const [orders, total] = await Promise.all([
        populateOrder(baseQuery().skip((page - 1) * limit).limit(limit)),
        Order.countDocuments({ user: req.user.id }),
      ]);
      return res.status(200).json(
        createSuccess(200, "Your orders fetched successfully", {
          orders,
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

    // Safety bound for the legacy (no-pagination) callers. The response stays
    // the SAME array shape it always was; it is simply capped so a caller that
    // forgets page/limit can never trigger an unbounded collection read. The
    // app's own callers always pass page/limit (OrderTrackingWidget,
    // profile/orders), so their results are unchanged.
    const LEGACY_MAX_ORDERS = 100;
    const orders = await populateOrder(baseQuery().limit(LEGACY_MAX_ORDERS));

    return res
      .status(200)
      .json(createSuccess(200, "Your orders fetched successfully", orders));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. GET SINGLE ORDER BY ID
// ==========================================
export const getOrderById = async (req, res, next) => {
  try {
    const order = await populateOrder(Order.findById(req.params.id));

    if (!order) {
      return next(createError(404, "Order not found"));
    }

    if (
      order.user._id.toString() !== req.user.id.toString() &&
      !req.user.isAdmin
    ) {
      return next(createError(401, "You are not authorized"));
    }

    return res
      .status(200)
      .json(createSuccess(200, "Order fetched successfully", order));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// PUBLIC ORDER TRACKING (no auth) - used by QR code on printed reports
// ==========================================
export const trackOrder = async (req, res, next) => {
  try {
    // Security: this endpoint is public (no auth), so PII must never leave the
    // server. The projection guarantees recipient phone, street address and GPS
    // coordinates are not even fetched, and the manually-built payload below
    // only exposes coarse + non-sensitive fields (no prices, no customer
    // contact details). Full order data stays on the authenticated endpoints
    // (GET /order/getOrder/:id and GET /tracking/order/:orderId).
    const order = await populateOrder(
      Order.findById(req.params.id).select(
        "-shippingAddress.phoneNo -shippingAddress.address -shippingAddress.latitude -shippingAddress.longitude",
      )
    ).populate("assignedRider", "name");

    if (!order) {
      return next(createError(404, "Order not found"));
    }

    const tracking = {
      _id: order._id,
      serialNumber: order.serialNumber,
      trackingNumber: order.trackingNumber || null,
      status: order.status,
      trackingHistory: order.trackingHistory,
      estimatedDelivery: order.eta || null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      // Cancellation metadata (non-sensitive — shown on the customer's own
      // tracking page so they can see who/when/why an order was cancelled).
      cancelledBy: order.cancelledBy || null,
      cancelReason: order.cancelReason || null,
      cancelledAt: order.cancelledAt || null,
      // Masked recipient info: first name only, coarse city/country. No phone,
      // no street address, no GPS coordinates.
      shippingAddress: {
        fullName: order.shippingAddress?.fullName?.split(" ")[0] || "Customer",
        city: order.shippingAddress?.city || "",
        country: order.shippingAddress?.country || "",
      },
      orderItems: (order.orderItems || []).map((item) => ({
        quantity: item.quantity,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        product: item.product
          ? {
              name: item.product.name,
              slug: item.product.slug,
              images: item.product.images,
            }
          : null,
        customizationAnswers: (item.customizationAnswers || []).map((answer) => ({
          label: answer.label || "",
          value: answer.value || "",
        })),
      })),
      assignedRider: order.assignedRider
        ? { name: order.assignedRider.name || "Rider" }
        : null,
    };

    return res
      .status(200)
      .json(createSuccess(200, "Order tracking fetched successfully", tracking));
  } catch (error) {
    next(error);
  }
};


// ==========================================
// 4. GET ALL ORDERS (ADMIN)
// ==========================================
export const getAllOrders = async (req, res, next) => {
  try {
    await assignMissingSerialNumbers();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter object from existing query params
    // (keep any existing status/date filters intact)
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { trackingNumber: { $regex: req.query.search, $options: "i" } },
        { serialNumber: parseInt(req.query.search) || -1 },
      ];
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [orders, total] = await Promise.all([
      populateOrder(
        Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      ),
      Order.countDocuments(filter),
    ]);

    // Browser cache: let the admin panel serve this list instantly when the
    // admin navigates back within 30s (stale-while-revalidate keeps it fresh
    // in the background). private = only the logged-in admin's browser.
    res.set({
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      Vary: "Cookie",
    });

    return res.status(200).json(
      createSuccess(200, "All orders fetched successfully", {
        orders,
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
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. UPDATE ORDER STATUS (ADMIN) - with Notification
// ==========================================
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    debugLog(`[Order Status Update]: Admin updating order ${orderId} to ${status}`);

    if (!status) {
      return next(createError(400, "Status is required"));
    }

    const validStatuses = ["Pending", "Processing", "Packed", "Shipped", "Out for Delivery", "Reached Destination", "Delivered", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return next(createError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // ── Order State Machine: validate the transition is allowed ──
    // Prevents illegal transitions like Delivered → Cancelled or Cancelled → Shipped.
    const previousStatus = order.status;
    if (previousStatus !== status) {
      const transition = validateStatusTransition(previousStatus, status);
      if (!transition.valid) {
        return next(createError(400, transition.reason));
      }
    }
    const now = new Date();
    order.status = status;
    order.trackingHistory.push({ status, timestamp: now });

    if (status === "Reached Destination") {
      order.reachedTime = now;
    }
    if (status === "Delivered") {
      order.deliveredTime = now;
    }
    // Record who cancelled and when (admin-initiated) so the admin panel
    // always shows a cancellation time/actor, not just for customer cancels.
    if (status === "Cancelled" && previousStatus !== "Cancelled") {
      order.cancelledBy = "admin";
      order.cancelledAt = now;
    }
    if (!order.trackingNumber) {
      order.trackingNumber = generateTrackingNumber(order.serialNumber);
    }
    await order.save();

    // ─── Non-blocking notification: in-app + push + real-time socket ───
    // (shared helper) — only when the status actually changed so a re-sent
    // status update never creates a duplicate notification.
    const serialStr = order.serialNumber
      ? `#${order.serialNumber}`
      : order._id.toString().slice(-8).toUpperCase();

    if (previousStatus !== status) {
      // ─── Stock restoration on cancellation (exactly once) ───
      // Restore inventory whenever an order is cancelled — but NEVER for
      // orders that were already delivered (the goods are with the customer,
      // so stock must stay sold). The inventoryRestored flag guarantees no
      // double restoration if the status is re-sent or the order is later
      // deleted.
      if (status === "Cancelled" && previousStatus !== "Delivered") {
        // Non-blocking: a stock-restore hiccup must never turn a committed
        // status change into a 500 or skip the notification/referral hooks.
        try {
          await restoreOrderStock(order);
        } catch (restoreErr) {
          console.error(`[Order] Stock restore failed for order ${order._id}:`, restoreErr.message || restoreErr);
        }
      }

      notifyOrderStatusChange({ order, status, serialStr });

      // ─── Referral rewards lifecycle (fire-and-forget, idempotent) ───
      try {
        const { dispatchOrderStatusHooks } = await import("../utils/referralService.js");
        dispatchOrderStatusHooks(order, status);
      } catch (refHookErr) {
        console.error("[Referral] Hook dispatch error:", refHookErr.message || refHookErr);
      }

      // ── Marketplace broadcast: when an order transitions to "Shipped" with
      // no assigned rider, notify all riders about the new available job.
      // Inside the status-changed guard so re-submitting "Shipped" on an
      // already-Shipped order never re-broadcasts the job.
      if (status === "Shipped" && !order.assignedRider) {
        const { broadcastNewMarketplaceJob } = await import("../Controllers/trackingController.js");
        broadcastNewMarketplaceJob(order._id);
      }
    }

    // Broadcast the status change via Pusher so the customer tracking
    // page and admin map update without a refresh.
    broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:status",
      data: {
        orderId: order._id,
        status,
        trackingHistory: order.trackingHistory,
        reachedTime: order.reachedTime,
        deliveredTime: order.deliveredTime,
        updatedAt: order.updatedAt,
      },
    });

    // ── Audit log (fire-and-forget, never blocks response) ──
    try {
      const { logAudit } = await import("../Models/AuditLog.js");
      await logAudit({
        action: "order.status_change",
        target: { collection: "Order", documentId: order._id, name: `#${order.serialNumber || order._id}` },
        metadata: { previousStatus, newStatus: status, cancelReason: order.cancelReason },
      }, req);
    } catch { /* swallow — audit must never block */ }

    return res
      .status(200)
      .json(createSuccess(200, "Order status updated successfully", order));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. UPDATE ORDER (ADMIN) - Legacy
// ==========================================
export const updateOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return next(createError(404, "Order not found"));
    }

    const { paymentStatus } = req.body;

    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();

    return res
      .status(200)
      .json(createSuccess(200, "Order updated successfully", order));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 7. GET ORDER INVOICE (ADMIN / ORDER OWNER)
// ==========================================
export const getOrderInvoice = async (req, res, next) => {
  try {
    const order = await populateOrder(Order.findById(req.params.id));

    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Only the order owner or an admin can download the invoice
    if (
      order.user._id.toString() !== req.user.id.toString() &&
      !req.user.isAdmin &&
      req.user.role !== "admin" &&
      req.user.role !== "superadmin"
    ) {
      return next(createError(401, "You are not authorized to view this invoice"));
    }

    // pdfkit is heavy — lazy-load it (and the generator module) only when an
    // invoice is actually requested, so order paths that never touch PDFs stay
    // light (helps serverless cold starts).
    const { generateInvoice } = await import("../utils/generateInvoice.js");
    const pdfBuffer = await generateInvoice(order);

    const filename = `invoice-${order.serialNumber || order._id}.pdf`;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Helper: Generate and email invoice asynchronously
// ==========================================
async function generateAndEmailInvoice(orderId) {
  try {
    const order = await populateOrder(Order.findById(orderId));
    if (!order) {
      console.error(`[Invoice] Order ${orderId} not found for invoice generation`);
      return;
    }

    // pdfkit is heavy — lazy-loaded only when an invoice is actually generated
    // (keeps every other order code path free of the ~1MB module).
    const { generateInvoice } = await import("../utils/generateInvoice.js");
    const pdfBuffer = await generateInvoice(order);

    // Base64 encode the PDF for the attachment
    const attachment = pdfBuffer.toString("base64");

    const customerEmail = order.user?.email;
    if (!customerEmail) {
      console.warn(`[Invoice] No email for user on order ${orderId}, skipping email`);
      return;
    }

    const serialStr = order.serialNumber ? `#${order.serialNumber}` : order._id.toString().slice(-8).toUpperCase();

    const subject = `Your Irhas'Inn Order Confirmation — Invoice Attached (${serialStr})`;

    const text = `Dear ${order.user?.username || order.shippingAddress?.fullName || "Customer"},\n\nThank you for your order with Irhas'Inn!\n\nOrder #${serialStr}\nTotal: Rs ${(order.totalPrice || 0).toLocaleString()}\nStatus: ${order.status}\n\nYour invoice is attached to this email as a PDF.\n\nFor any questions, please contact us.\n\nIrhas'Inn — Premium Quality Delivered with Care Across Pakistan`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Order Confirmation</title>
<style>
  @media only screen and (max-width: 520px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .inner-padding { padding: 28px 20px !important; }
    .header-pad { padding: 22px 20px !important; }
    .footer-pad { padding: 18px 20px 24px 20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f2; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f2; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:480px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td class="header-pad" style="background: linear-gradient(135deg, #222831 0%, #C8A84E 100%); padding: 32px 32px;" align="center">
              <span style="color:#ffffff; font-size:24px; font-weight:bold; letter-spacing:1.5px; font-family: Arial, Helvetica, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,0.2);">Irhas'Inn</span>
            </td>
          </tr>
          <tr>
            <td style="height:5px; background: linear-gradient(90deg, #C8A84E, #222831, #C8A84E);"></td>
          </tr>
          <tr>
            <td class="inner-padding" style="padding: 40px 36px 28px 36px;">
              <p style="margin:0 0 4px 0; color:#111111; font-size:17px; font-weight:600;">Order Confirmed!</p>
              <p style="margin:0 0 24px 0; color:#666666; font-size:14.5px; line-height:1.7;">
                Thank you for your order, <strong style="color:#333;">${order.user?.username || order.shippingAddress?.fullName || "Customer"}</strong>!
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa; border-radius:8px; border-left: 4px solid #C8A84E;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px 0; color:#333333; font-size:14px; font-weight:600;">Order #${serialStr}</p>
                    <p style="margin:0 0 4px 0; color:#555555; font-size:13px;">Status: <strong>${order.status}</strong></p>
                    <p style="margin:0 0 4px 0; color:#555555; font-size:13px;">Payment: <strong>${order.paymentMethod || "Cash on Delivery"}</strong></p>
                    <p style="margin:0; color:#C8A84E; font-size:15px; font-weight:700;">Total: Rs ${(order.totalPrice || 0).toLocaleString()}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0; color:#666666; font-size:14px; line-height:1.7;">
                Your invoice is attached to this email as a PDF. Please save it for your records.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 36px;">
              <hr style="border:none; border-top:1px solid #eeeeee; margin:0;" />
            </td>
          </tr>
          <tr>
            <td class="footer-pad" style="padding: 22px 36px 30px 36px;" align="center">
              <p style="margin:0 0 6px 0; color:#999999; font-size:12.5px;">Need help? Contact us at <a href="mailto:${process.env.EMAIL || "support@irhasinn.com"}" style="color:#C8A84E; text-decoration:none; font-weight:600;">${process.env.EMAIL || "support@irhasinn.com"}</a></p>
              <p style="margin:0 0 6px 0; color:#c2c2c2; font-size:11.5px;">Karachi, Pakistan</p>
              <p style="margin:0; color:#c2c2c2; font-size:12px;">© ${new Date().getFullYear()} Irhas'Inn. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    await sendEmail(
      customerEmail,
      subject,
      text,
      html,
      [
        {
          filename: `invoice-${serialStr}.pdf`,
          content: attachment,
          encoding: "base64",
          contentType: "application/pdf",
        },
      ]
    );

    debugLog(`[Invoice] Invoice emailed to ${customerEmail} for order ${orderId}`);
  } catch (error) {
    // Never throw — this is a fire-and-forget helper
    console.error(`[Invoice] Failed to generate/email invoice for order ${orderId}:`, error.message || error);
  }
}

// ==========================================
// 8. DELETE ORDER (ADMIN)
// ==========================================
export const deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Restore inventory for non-delivered orders (exactly once — the
    // inventoryRestored flag is shared with cancellation, so an order that
    // was already cancelled never has its stock restored a second time).
    // Delivered orders are untouched — the goods are with the customer.
    if (order.status !== "Delivered") {
      try {
        await restoreOrderStock(order);
      } catch (restoreErr) {
        console.error(`[Order] Stock restore failed for order ${order._id}:`, restoreErr.message || restoreErr);
      }
    }

    // Referral hardening: deleting a Delivered order must still claw back any
    // already-credited reward and refund wallet redemptions before the record
    // is gone — otherwise the referrer keeps money from a removed order.
    try {
      const { dispatchOrderStatusHooks } = await import("../utils/referralService.js");
      dispatchOrderStatusHooks(order, "Cancelled");
    } catch (hookErr) {
      console.error("[Referral] Hook dispatch on delete failed:", hookErr.message || hookErr);
    }

    await Order.findByIdAndDelete(req.params.id);

    return res
      .status(200)
      .json(createSuccess(200, "Order deleted successfully"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 9. CANCEL ORDER (CUSTOMER)
// ------------------------------------------------------------
// Secure customer-initiated cancellation. All rules are enforced
// server-side:
//  - the order must belong to the logged-in customer
//  - the order must still be in "Pending" (customers can NOT cancel
//    once Processing has begun — and never a delivered order)
//  - a double-click / re-submit can never cancel twice (400 on repeat)
//  - the customer can never set any other status manually (this endpoint
//    only ever moves an order to "Cancelled")
// Side effects (all reused, non-blocking): stock restored exactly once,
// tracking history entry with reason, referral/wallet cleanup via the shared
// hooks, in-app + push notification, and real-time socket events so the
// customer tracking page and the admin panel update instantly.
// ==========================================
export const cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { cancelReason } = req.body || {};

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Ownership — only the order's owner may cancel it.
    if (!order.user || order.user.toString() !== req.user.id) {
      return next(createError(403, "You are not authorized to cancel this order"));
    }

    if (order.status === "Cancelled") {
      return next(createError(400, "This order is already cancelled"));
    }
    if (order.status !== "Pending") {
      return next(
        createError(400, "This order can no longer be cancelled — it is already being processed")
      );
    }

    const now = new Date();
    const reason =
      cancelReason && String(cancelReason).trim()
        ? String(cancelReason).trim().slice(0, 500)
        : "";

    order.status = "Cancelled";
    order.cancelledBy = "customer";
    order.cancelledAt = now;
    order.cancelReason = reason || null;
    order.trackingHistory.push({
      status: "Cancelled",
      timestamp: now,
      note: reason ? `Cancelled by customer — ${reason}` : "Cancelled by customer",
    });
    await order.save();

    // Restore inventory exactly once (a Pending order was never delivered,
    // so the goods are still in stock). Non-blocking: the cancellation itself
    // is already committed — a restore failure must not surface a 500.
    try {
      await restoreOrderStock(order);
    } catch (restoreErr) {
      console.error(`[Order] Stock restore failed for order ${order._id}:`, restoreErr.message || restoreErr);
    }

    // ─── Non-blocking notification: in-app + push + real-time socket ───
    const serialStr = order.serialNumber
      ? `#${order.serialNumber}`
      : order._id.toString().slice(-8).toUpperCase();
    notifyOrderStatusChange({ order, status: "Cancelled", serialStr });

    // ─── Referral + wallet cleanup (cancel pending reward, refund any
    // wallet redemption) — fire-and-forget and idempotent ───
    try {
      const { dispatchOrderStatusHooks } = await import("../utils/referralService.js");
      dispatchOrderStatusHooks(order, "Cancelled");
    } catch (refHookErr) {
      console.error("[Referral] Cancel hook dispatch error:", refHookErr.message || refHookErr);
    }

    // Real-time socket event so the customer tracking page and the admin
    // panel (Tracking + Orders) update without a refresh.
    broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:status",
      data: {
        orderId: order._id,
        status: "Cancelled",
        trackingHistory: order.trackingHistory,
        reachedTime: order.reachedTime,
        deliveredTime: order.deliveredTime,
        updatedAt: order.updatedAt,
      },
    });

    return res
      .status(200)
      .json(createSuccess(200, "Order cancelled successfully", order));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 10. CHANGE DELIVERY LOCATION (CUSTOMER)
// ------------------------------------------------------------
// Lets a customer move the delivery pin / correct the address of their OWN
// order while it is still pre-dispatch. Every rule is enforced HERE, on the
// server — the frontend only mirrors them for UX (exactly like cancelOrder):
//  - ownership: the order must belong to the logged-in customer.
//  - status: Pending | Processing | Packed only — never once the parcel may
//    already be with a rider (see roleHelpers.canChangeDeliveryLocation).
//  - assignment: no rider may already be assigned. `assignRider` has no
//    status guard, so a rider can exist on a still-early order; a rider
//    heading to the old address must never have the destination moved
//    underneath them (conservative interpretation).
//  - city: locked to the order's original city. Shipping was priced from that
//    city at checkout (Settings.cityShipping, else the per-product
//    shippingCharge / base fee), so a cross-city move would silently
//    invalidate order.shippingPrice and the admin's city-wise shipping
//    rules. It is rejected rather than recalculated — recalculating would
//    mean refactoring createOrder's revenue-critical pricing path.
// Address fields are validated by the SAME shared rule set as checkout
// (utils/orderAddressValidation.js).
// Side effects (all reused, non-blocking): a trackingHistory audit entry, a
// real-time `tracking:destination` event so admin/rider/customer maps redraw
// without a refresh, and an in-app + push notification to the customer.
// ==========================================
export const updateOrderLocation = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { shippingAddress, dryRun } = req.body || {};

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Ownership — only the order's owner may move its delivery location.
    // (Re-validated server-side; never trust the client's claim.)
    if (!order.user || order.user.toString() !== req.user.id) {
      return next(
        createError(403, "You are not authorized to change this order's location")
      );
    }

    // Status + assignment guard. Re-checked here even though the frontend
    // hides the button, so a status change that happened while the customer
    // had the modal open (admin assigns a rider + marks it Shipped) is
    // rejected cleanly instead of silently moving a dispatched order.
    const permission = canChangeDeliveryLocation(order);
    if (!permission.allowed) {
      return next(createError(400, permission.reason));
    }

    if (!shippingAddress) {
      return next(createError(400, "Shipping address is required"));
    }

    const addressResult = validateShippingAddressInput(shippingAddress);
    if (!addressResult.ok) {
      return next(createError(400, addressResult.error));
    }
    const nextAddress = addressResult.value;

    /*
     * ── City change + shipping recalculation ──
     * A different city can now be accepted, but shipping was priced from the
     * ORIGINAL city, so it has to be recomputed with the EXACT same calculator
     * checkout uses (utils/shipping.js) before the change is applied. The
     * recalculation is available as a dry run so the customer can be shown the
     * real fee difference before confirming — never a client-side estimate.
     *
     * An omitted/blank city keeps the stored value: the address validator would
     * otherwise default a blank city to "Karachi" and corrupt the order.
     */
    const currentCity = String(order.shippingAddress?.city || "").trim();
    const requestedCity = String(shippingAddress.city ?? "").trim();
    const currentCityKey = normalizeCityName(currentCity);
    const requestedCityKey = normalizeCityName(requestedCity);
    // Only a SUPPLIED, different, non-empty city counts as a city change.
    const cityChanged =
      requestedCityKey !== "" && requestedCityKey !== currentCityKey;

    let shippingChange = null;
    if (cityChanged) {
      /*
       * Re-fetch the ordered products: the order stores a price snapshot, but
       * NOT the per-product freeShipping / shippingCharge flags the calculator
       * needs, so they must come from the products themselves — exactly as
       * createOrder resolves them.
       */
      const productIds = (order.orderItems || []).map((item) => item.product);
      const [settingsDoc, orderedProducts] = await Promise.all([
        Settings.findOne({ key: "store" }).lean(),
        Product.find({ _id: { $in: productIds } })
          .select("freeShipping shippingCharge")
          .lean(),
      ]);
      const productById = new Map(
        orderedProducts.map((p) => [String(p._id), p])
      );
      const shippingItems = (order.orderItems || []).map((item) => {
        const product = productById.get(String(item.product));
        return {
          freeShipping: product?.freeShipping === true,
          shippingCharge: product?.shippingCharge,
        };
      });

      const { shipping: nextShippingFee, source } = calculateOrderShipping({
        items: shippingItems,
        // The stored server-computed items subtotal — the same figure
        // createOrder fed the threshold check, so the outcome is consistent.
        subtotal: Number(order.itemsPrice) || 0,
        settings: normalizeShippingSettings(settingsDoc),
        city: requestedCity,
      });

      /*
       * The money rule (settled online payment + a fee that moves ⇒ refuse)
       * lives in utils/shipping.js as a pure, unit-tested helper. A change
       * that leaves the fee identical is still allowed — no payment impact.
       */
      shippingChange = evaluateCityShippingChange({
        order,
        currentCity,
        requestedCity,
        nextShippingFee,
      });
      shippingChange.source = source;
    }

    /*
     * Dry run: report what WOULD happen and change nothing. Used by the order
     * detail modal to present the real fee difference for confirmation before
     * the customer commits. Returns before any write, event or notification.
     */
    if (dryRun === true) {
      return res.status(200).json(
        createSuccess(200, "Shipping recalculation", {
          shippingChange,
          currentShippingPrice: Number(order.shippingPrice) || 0,
          currentTotalPrice: Number(order.totalPrice) || 0,
          itemsPrice: Number(order.itemsPrice) || 0,
        })
      );
    }

    // Refuse atomically BEFORE mutating anything — the customer never ends up
    // with a moved destination and an unpayable fee difference.
    if (shippingChange?.blocked) {
      return next(createError(400, shippingChange.reason));
    }

    nextAddress.city = requestedCity || currentCity || nextAddress.city;
    nextAddress.country = order.shippingAddress?.country || nextAddress.country;

    // Keep the previously stored pin when the customer only corrected the
    // text address (no new coordinates sent). Legacy orders may legitimately
    // have no coordinates at all — that is fine, the map is optional.
    if (nextAddress.latitude == null && order.shippingAddress?.latitude != null) {
      nextAddress.latitude = order.shippingAddress.latitude;
    }
    if (nextAddress.longitude == null && order.shippingAddress?.longitude != null) {
      nextAddress.longitude = order.shippingAddress.longitude;
    }

    const now = new Date();
    order.shippingAddress = nextAddress;
    order.locationChangedAt = now;
    order.locationChangeCount = (Number(order.locationChangeCount) || 0) + 1;

    /*
     * Apply the recalculated fee (only when the city actually changed AND the
     * amount moved). totalPrice is rebuilt with the SAME formula createOrder
     * used — items + shipping − wallet redemption — so every other component
     * (discount, wallet, referral) is preserved untouched.
     *
     * COD / unpaid orders simply carry the corrected amount to collection; a
     * paid-online order with a difference never reaches here (blocked above).
     */
    if (shippingChange && shippingChange.difference !== 0) {
      const previousShipping = Number(order.shippingPrice) || 0;
      order.shippingPrice = shippingChange.to;
      order.totalPrice = Math.max(
        0,
        Math.round(
          (Number(order.itemsPrice) + shippingChange.to -
            (Number(order.walletRedemptionAmount) || 0)) * 100
        ) / 100
      );
      order.shippingAdjustments = [
        ...(order.shippingAdjustments || []),
        {
          fromShipping: previousShipping,
          toShipping: shippingChange.to,
          difference: shippingChange.difference,
          fromCity: shippingChange.fromCity,
          toCity: shippingChange.toCity,
          reason: "Delivery city changed by customer — shipping recalculated",
          changedAt: now,
        },
      ];
      order.trackingHistory.push({
        status: order.status,
        timestamp: now,
        note:
          `Shipping fee ${shippingChange.difference > 0 ? "increased" : "reduced"} ` +
          `from Rs ${previousShipping} to Rs ${shippingChange.to} ` +
          `(${shippingChange.fromCity} → ${shippingChange.toCity})`,
      });
    }
    // The destination moved, so any in-range GPS streak accumulated against
    // the OLD coordinates is meaningless. Reset it so the server-side
    // auto-"Reached Destination" proximity check (trackingController.
    // updateRiderLocation) can never advance an order off a stale streak.
    order.trackingMetadata = {
      ...(order.trackingMetadata || {}),
      proximityStreak: 0,
    };
    order.trackingHistory.push({
      status: order.status,
      timestamp: now,
      note: `Delivery location changed by customer — ${nextAddress.address}, ${nextAddress.city}`,
    });
    await order.save();

    const serialStr = order.serialNumber
      ? `#${order.serialNumber}`
      : order._id.toString().slice(-8).toUpperCase();

    // ─── Real-time: destination changed ───
    // Dedicated event: no existing event carries an address (tracking:status
    // only carries status/history, and every tracking:location listener bails
    // out unless `riderLocation` is present), so reusing one would silently
    // drop the update. Payload follows the same { orderId, ... } convention
    // and is broadcast through the same helper (customer + assigned rider +
    // all admins), fire-and-forget like the other tracking events.
    broadcastTrackingEvent({
      orderId: order._id,
      event: "tracking:destination",
      data: {
        orderId: order._id,
        status: order.status,
        shippingAddress: order.shippingAddress,
        trackingHistory: order.trackingHistory,
        locationChangedAt: order.locationChangedAt,
        updatedAt: order.updatedAt,
      },
    });

    // ─── Non-blocking notification: in-app + push + real-time ───
    notifyOrderLocationChanged({ order, serialStr });

    return res
      .status(200)
      .json(createSuccess(200, "Delivery location updated successfully", order));
  } catch (error) {
    next(error);
  }
};
