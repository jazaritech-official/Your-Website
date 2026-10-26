import crypto from "crypto";

/* ===========================================================
   MEEZAN BANK PAYMENT PROVIDER
   Integration with Meezan Bank Online Payment Gateway.

   Required environment variables:
     MEEZAN_MERCHANT_ID       - Merchant ID from Meezan Bank
     MEEZAN_SECRET_KEY        - Secret key for signing
     MEEZAN_RETURN_URL        - Return URL after payment
     MEEZAN_NOTIFY_URL        - Webhook/callback URL

   Meezan Bank supports multiple integration methods:
     - Hosted Payment Page (redirect)
     - API-based card processing

   This implementation uses the hosted payment page flow:
     1. Server creates a signed payment request
     2. Customer is redirected to Meezan payment page
     3. After payment, customer returns to return URL
     4. Server verifies payment status via API

   NOTE: Meezan Bank's exact API endpoints and signature
   format should be confirmed with the bank's integration
   team. This implementation follows standard patterns used
   by Pakistani bank payment gateways.
   =========================================================== */

const getEnv = (key) => process.env[key] || "";

export const meezanProvider = {
  displayName: "Meezan Bank",

  isConfigured() {
    return !!(getEnv("MEEZAN_MERCHANT_ID") && getEnv("MEEZAN_SECRET_KEY"));
  },

  /**
   * Generate HMAC-SHA256 signature for Meezan.
   */
  _generateSignature(data) {
    const secretKey = getEnv("MEEZAN_SECRET_KEY");
    return crypto
      .createHmac("sha256", secretKey)
      .update(data)
      .digest("hex");
  },

  /**
   * Initialize a Meezan Bank payment.
   * Returns the redirect URL for the customer.
   */
  async initializePayment(order, customerInfo) {
    const merchantId = getEnv("MEEZAN_MERCHANT_ID");
    const returnUrl = getEnv("MEEZAN_RETURN_URL");
    const notifyUrl = getEnv("MEEZAN_NOTIFY_URL");

    if (!merchantId || !returnUrl) {
      throw new Error("Meezan Bank configuration incomplete");
    }

    const amount = Number(order.totalPrice);
    const orderId = `MZ${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Build the payload
    const payload = {
      merchantId,
      orderId,
      amount: String(amount),
      currency: "PKR",
      returnUrl,
      notifyUrl: notifyUrl || returnUrl,
      description: `Payment for Order #${order.serialNumber || order._id}`,
      customerName: customerInfo.name || "Customer",
      customerEmail: customerInfo.email || "",
      customerPhone: customerInfo.phone || "",
      // Store order ID for callback lookup
      orderId2: String(order._id),
    };

    // Generate signature
    const signatureString = `${merchantId}${orderId}${amount}PKR`;
    payload.signature = this._generateSignature(signatureString);

    // Build redirect URL (Meezan Bank standard endpoint)
    const baseUrl = getEnv("MEEZAN_API_URL") || "https://sandbox.meezanbank.com/payment/merchant";

    return {
      url: baseUrl,
      transactionRef: orderId,
      payload,
    };
  },

  /**
   * Verify a Meezan Bank payment callback.
   * Validates the callback signature to prevent forged completions.
   *
   * @param {string} transactionRef - The transaction reference
   * @param {string} orderId - The internal order ID
   * @param {object} callbackData - The full callback request body
   * @returns {object} Verification result
   */
  async verifyPayment(transactionRef, orderId, callbackData = {}) {
    const merchantId = getEnv("MEEZAN_MERCHANT_ID");
    const secretKey = getEnv("MEEZAN_SECRET_KEY");

    if (!merchantId || !secretKey) {
      return {
        transactionRef,
        orderId,
        status: "pending",
        verified: false,
        message: "Meezan credentials not configured",
      };
    }

    // Meezan sends: signature, paymentStatus, responseCode in callback
    const receivedSignature = callbackData.signature;
    const paymentStatus = callbackData.paymentStatus || callbackData.status;
    const responseCode = callbackData.responseCode;

    if (!receivedSignature) {
      return {
        transactionRef,
        orderId,
        status: "pending",
        verified: false,
        message: "Missing Meezan callback signature",
      };
    }

    // Reconstruct the signature: HMAC-SHA256 of merchantId + orderId + amount + currency
    const amount = callbackData.amount || "";
    const signatureString = `${merchantId}${transactionRef}${amount}PKR`;
    const expectedSignature = this._generateSignature(signatureString);

    // Constant-time comparison
    const sigValid = crypto.timingSafeEqual(
      Buffer.from(receivedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );

    if (!sigValid) {
      console.error("[Payment] Meezan signature mismatch for", transactionRef);
      return {
        transactionRef,
        orderId,
        status: "failed",
        verified: false,
        message: "Invalid Meezan callback signature",
      };
    }

    // Signature valid — check payment status
    let status;
    if (paymentStatus === "completed" || paymentStatus === "SUCCESS" || responseCode === "00") {
      status = "completed";
    } else if (paymentStatus === "pending" || paymentStatus === "PROCESSING") {
      status = "processing";
    } else {
      status = "failed";
    }

    return {
      transactionRef,
      orderId,
      status,
      verified: true,
      message: `Meezan callback verified. Status: ${paymentStatus}`,
    };
  },

  /**
   * Verify Meezan callback signature (used by paymentController).
   * @param {object} callbackData - The full callback request body
   * @returns {boolean} true if signature is valid
   */
  verifyCallbackSignature(callbackData) {
    const secretKey = getEnv("MEEZAN_SECRET_KEY");
    const merchantId = getEnv("MEEZAN_MERCHANT_ID");
    if (!secretKey || !merchantId) return false;

    const receivedSignature = callbackData.signature;
    if (!receivedSignature) return false;

    const amount = callbackData.amount || "";
    const orderId = callbackData.orderId || transactionRef || "";
    const signatureString = `${merchantId}${orderId}${amount}PKR`;
    const expectedSignature = this._generateSignature(signatureString);

    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return false;
    }
  },
};
