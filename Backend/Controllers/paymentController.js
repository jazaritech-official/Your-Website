import { Payment } from "../Models/Payment.js";
import { Order } from "../Models/Orders.js";
import { Product } from "../Models/Product.js";
import { Settings } from "../Models/Settings.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { getPaymentProvider, getAvailableProviders } from "../utils/paymentProviders/index.js";

/* ===========================================================
   PAYMENT CONTROLLER
   Handles online payment initialization, callback processing,
   and verification. Cash on Delivery continues to work exactly
   as before through the existing order controller.

   SECURITY PRINCIPLES:
   - Frontend NEVER sends the payment amount — server recalculates
   - Gateway callbacks are verified server-side
   - Payment status is only updated by the server
   - Idempotent callback processing prevents duplicate charges
   =========================================================== */

// ==========================================
// 1. GET AVAILABLE PAYMENT PROVIDERS
// ==========================================
export const getAvailablePaymentMethods = async (req, res, next) => {
  try {
    const providers = getAvailableProviders();
    // Always include COD
    const methods = [
      { id: "cod", name: "Cash on Delivery", available: true },
      ...providers.map((p) => ({
        id: p.name,
        name: p.displayName,
        available: true,
      })),
    ];
    return res
      .status(200)
      .json(createSuccess(200, "Payment methods fetched", methods));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. INITIALIZE ONLINE PAYMENT
// ==========================================
export const initializePayment = async (req, res, next) => {
  try {
    const { orderId, provider: providerName, phone } = req.body;

    if (!orderId) {
      return next(createError(400, "Order ID is required"));
    }
    if (!providerName) {
      return next(createError(400, "Payment provider is required"));
    }

    // Validate provider
    const provider = getPaymentProvider(providerName);
    if (!provider) {
      return next(
        createError(400, `Payment provider "${providerName}" is not configured`)
      );
    }

    // Fetch the order
    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Verify the order belongs to the requesting user
    if (order.user.toString() !== req.user.id.toString()) {
      return next(createError(401, "Not authorized"));
    }

    // Only pending COD orders can be converted to online payment
    if (order.paymentMethod !== "Cash on Delivery" && order.paymentStatus !== "pending") {
      return next(createError(400, "This order cannot be paid online"));
    }

    // Recalculate the order amount server-side (never trust frontend)
    let serverTotal = 0;
    const orderItems = await Order.findById(orderId).select("orderItems itemsPrice shippingPrice discountAmount totalPrice");

    // Use the already-calculated server-side amounts from the order
    serverTotal = Math.max(0,
      Math.round(
        ((order.itemsPrice || 0) + (order.shippingPrice || 0) - (order.discountAmount || 0)) * 100
      ) / 100
    );

    // Amount must match (allow 1 paisa tolerance for rounding)
    if (Math.abs(serverTotal - order.totalPrice) > 0.01) {
      return next(createError(400, "Payment amount mismatch"));
    }

    // Create payment record
    const payment = await Payment.create({
      order: orderId,
      user: req.user.id,
      provider: providerName.toLowerCase(),
      amount: order.totalPrice,
      currency: "PKR",
      status: "pending",
      customerPhone: phone || order.shippingAddress?.phoneNo || null,
    });

    // Initialize payment with the provider
    try {
      const result = await provider.initializePayment(
        {
          _id: order._id,
          serialNumber: order.serialNumber,
          totalPrice: order.totalPrice,
        },
        {
          name: order.shippingAddress?.fullName || "Customer",
          email: req.user.email || "",
          phone: phone || order.shippingAddress?.phoneNo || "",
        }
      );

      // Update payment record with gateway details
      payment.transactionRef = result.transactionRef;
      payment.gatewayUrl = result.url;
      payment.gatewayResponse = result.payload || result.params || null;
      payment.status = "processing";
      await payment.save();

      // Update order payment method
      order.paymentMethod = provider.displayName;
      await order.save();

      return res.status(200).json(
        createSuccess(200, "Payment initialized", {
          paymentId: payment._id,
          transactionRef: result.transactionRef,
          gatewayUrl: result.url,
          payload: result.payload || result.params || null,
        })
      );
    } catch (gatewayError) {
      // Gateway initialization failed — update payment status
      payment.status = "failed";
      payment.failureReason = gatewayError.message || "Payment gateway error";
      await payment.save();

      return next(createError(500, "Payment initialization failed. Please try again."));
    }
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. PAYMENT CALLBACK (Gateway → Server)
// ==========================================
export const handlePaymentCallback = async (req, res, next) => {
  try {
    const { provider: providerName } = req.params;
    const callbackData = req.body;

    const provider = getPaymentProvider(providerName);
    if (!provider) {
      return next(createError(400, "Unknown payment provider"));
    }

    // Extract transaction reference from callback
    const transactionRef =
      callbackData.TransactionRefNo ||
      callbackData.transactionRef ||
      callbackData.orderId ||
      callbackData.reference_id;

    if (!transactionRef) {
      return next(createError(400, "Missing transaction reference"));
    }

    // Find the payment record
    const payment = await Payment.findOne({
      transactionRef,
      provider: providerName.toLowerCase(),
    });

    if (!payment) {
      return next(createError(404, "Payment record not found"));
    }

    // Idempotency: if already processed, return current status
    if (payment.processedCallback && payment.status === "completed") {
      return res.status(200).json(
        createSuccess(200, "Payment already processed", {
          status: payment.status,
          transactionRef: payment.transactionRef,
        })
      );
    }

    // ── SECURITY: Verify callback signature BEFORE processing ──
    // Each provider implements verifyCallbackSignature() to validate
    // the HMAC/MD5 signature from the gateway. Reject forged callbacks.
    if (provider.verifyCallbackSignature) {
      const sigValid = provider.verifyCallbackSignature(callbackData);
      if (!sigValid) {
        console.error(`[Payment] REJECTED forged callback for ${providerName} — transaction: ${transactionRef}`);
        return res.status(400).json(
          createError(400, "Invalid payment callback signature")
        );
      }
    }

    // Verify with the gateway (amount verification + status check)
    try {
      const verification = await provider.verifyPayment(
        transactionRef,
        payment.order.toString(),
        callbackData  // Pass callback data for provider-specific verification
      );

      // ── SECURITY: Verify amount matches server-side order amount ──
      if (verification.verified && verification.amount) {
        const expectedAmount = payment.amount;
        const callbackAmount = Number(verification.amount);
        if (Number.isFinite(expectedAmount) && Number.isFinite(callbackAmount)) {
          const amountDiff = Math.abs(expectedAmount - callbackAmount);
          if (amountDiff > 1) { // 1 PKR tolerance for rounding
            console.error(`[Payment] Amount mismatch for ${transactionRef}: expected ${expectedAmount}, got ${callbackAmount}`);
            payment.status = "failed";
            payment.failureReason = `Amount mismatch: expected ${expectedAmount}, received ${callbackAmount}`;
            payment.processedCallback = true;
            await payment.save();
            return res.status(200).json(
              createSuccess(200, "Payment amount mismatch", { status: "failed", transactionRef })
            );
          }
        }
      }

      if (verification.verified || verification.status === "completed") {
        // Payment successful
        payment.status = "completed";
        payment.completedAt = new Date();
        payment.processedCallback = true;
        payment.gatewayResponse = {
          ...payment.gatewayResponse,
          callback: callbackData,
          verification,
        };
        await payment.save();

        // Update order status
        const order = await Order.findById(payment.order);
        if (order) {
          order.paymentStatus = "paid";
          await order.save();
        }

        return res.status(200).json(
          createSuccess(200, "Payment successful", {
            status: "completed",
            transactionRef: payment.transactionRef,
          })
        );
      } else if (verification.status === "failed") {
        // Payment failed
        payment.status = "failed";
        payment.failureReason = verification.message || "Payment verification failed";
        payment.completedAt = new Date();
        payment.processedCallback = true;
        payment.gatewayResponse = {
          ...payment.gatewayResponse,
          callback: callbackData,
          verification,
        };
        await payment.save();

        return res.status(200).json(
          createSuccess(200, "Payment failed", {
            status: "failed",
            transactionRef: payment.transactionRef,
          })
        );
      }
    } catch (verifyError) {
      console.error(`[Payment] Verification error for ${providerName}:`, verifyError.message);
    }

    // Fallback: acknowledge receipt but indicate pending verification
    return res.status(200).json(
      createSuccess(200, "Callback received", {
        status: payment.status,
        transactionRef: payment.transactionRef,
      })
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. GET PAYMENT STATUS
// ==========================================
export const getPaymentStatus = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate("order", "serialNumber totalPrice status")
      .select("-gatewayResponse -__v");

    if (!payment) {
      return next(createError(404, "Payment not found"));
    }

    // Verify ownership
    if (payment.user.toString() !== req.user.id.toString() && !req.user.isAdmin) {
      return next(createError(401, "Not authorized"));
    }

    return res.status(200).json(
      createSuccess(200, "Payment status fetched", payment)
    );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. RETRY FAILED PAYMENT
// ==========================================
export const retryPayment = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return next(createError(400, "Order ID is required"));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    if (order.user.toString() !== req.user.id.toString()) {
      return next(createError(401, "Not authorized"));
    }

    // Only retry if the previous payment failed or is pending
    const lastPayment = await Payment.findOne({
      order: orderId,
      user: req.user.id,
    }).sort({ createdAt: -1 });

    if (lastPayment && lastPayment.status === "completed") {
      return next(createError(400, "Payment already completed"));
    }

    // Determine which provider to use
    const providerName = lastPayment?.provider || "cod";
    const provider = getPaymentProvider(providerName);

    if (!provider) {
      return next(createError(400, "Payment provider not available"));
    }

    // Re-initialize payment
    try {
      const result = await provider.initializePayment(
        {
          _id: order._id,
          serialNumber: order.serialNumber,
          totalPrice: order.totalPrice,
        },
        {
          name: order.shippingAddress?.fullName || "Customer",
          email: req.user.email || "",
          phone: order.shippingAddress?.phoneNo || "",
        }
      );

      // Create new payment record
      const payment = await Payment.create({
        order: orderId,
        user: req.user.id,
        provider: providerName.toLowerCase(),
        amount: order.totalPrice,
        currency: "PKR",
        status: "processing",
        transactionRef: result.transactionRef,
        gatewayUrl: result.url,
        gatewayResponse: result.payload || result.params || null,
        customerPhone: order.shippingAddress?.phoneNo || null,
      });

      return res.status(200).json(
        createSuccess(200, "Payment retry initialized", {
          paymentId: payment._id,
          transactionRef: result.transactionRef,
          gatewayUrl: result.url,
          payload: result.payload || result.params || null,
        })
      );
    } catch (gatewayError) {
      return next(createError(500, "Payment retry failed. Please try again."));
    }
  } catch (error) {
    next(error);
  }
};
