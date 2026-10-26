import crypto from "crypto";

/* ===========================================================
   EASYPAISA PAYMENT PROVIDER
   Integration with Easypaisa Online Payment Gateway.

   Required environment variables:
     EASYPAISA_MERCHANT_ID     - Merchant ID from Easypaisa
     EASYPAISA_SECRET_KEY      - Secret key for signing
     EASYPAISA_RETURN_URL      - Return URL after payment
     EASYPAISA_NOTIFY_URL      - Webhook/callback URL

   The integration follows Easypaisa's standard redirect flow:
     1. Server creates a signed payment request
     2. Customer is redirected to Easypaisa payment page
     3. After payment, customer returns to return URL
     4. Server verifies payment status via API

   NOTE: This implementation uses the standard Easypaisa
   integration pattern. The actual API endpoints should be
   configured via environment variables for flexibility.
   =========================================================== */

const getEnv = (key) => process.env[key] || "";

export const easypaisaProvider = {
  displayName: "Easypaisa",

  isConfigured() {
    return !!(getEnv("EASYPAISA_MERCHANT_ID") && getEnv("EASYPAISA_SECRET_KEY"));
  },

  /**
   * Generate HMAC-SHA256 signature for Easypaisa.
   */
  _generateSignature(data) {
    const secretKey = getEnv("EASYPAISA_SECRET_KEY");
    return crypto
      .createHmac("sha256", secretKey)
      .update(data)
      .digest("hex")
      .toUpperCase();
  },

  /**
   * Initialize an Easypaisa payment.
   * Returns the redirect URL for the customer.
   */
  async initializePayment(order, customerInfo) {
    const merchantId = getEnv("EASYPAISA_MERCHANT_ID");
    const returnUrl = getEnv("EASYPAISA_RETURN_URL");
    const notifyUrl = getEnv("EASYPAISA_NOTIFY_URL");

    if (!merchantId || !returnUrl) {
      throw new Error("Easypaisa configuration incomplete");
    }

    const amount = Math.round(order.totalPrice * 100); // Easypaisa uses paisa
    const orderId = `EP${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const orderDateTime = new Date().toISOString();

    // Build the payload
    const payload = {
      merchantId,
      orderId,
      orderAmount: String(amount),
      orderDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      orderExpiryPeriod: 24,
      paymentMethod: "both", // online + wallet
      paymentType: "MA",
      paymentStatusURL: notifyUrl || returnUrl,
      returnUrl,
      customerName: customerInfo.name || "Customer",
      customerEmail: customerInfo.email || "",
      customerPhone: customerInfo.phone || "",
      merchantPaymentMethod: ["COD"],
      additionalNotes: `Order #${order.serialNumber || order._id}`,
      // Store order ID in the reference for callback lookup
      accountExtraId: String(order._id),
    };

    // Generate signature
    const signatureString = `${merchantId}${orderId}${amount}`;
    payload.signature = this._generateSignature(signatureString);

    // Build redirect URL (Easypaisa standard endpoint)
    const baseUrl = getEnv("EASYPAISA_API_URL") || "https://sandbox.easypaisa.com.pk/easypaisa-payment/merchant";

    return {
      url: baseUrl,
      transactionRef: orderId,
      payload,
    };
  },

  /**
   * Verify an Easypaisa payment callback.
   * Validates the callback signature to prevent forged completions.
   *
   * @param {string} transactionRef - The transaction reference
   * @param {string} orderId - The internal order ID
   * @param {object} callbackData - The full callback request body
   * @returns {object} Verification result
   */
  async verifyPayment(transactionRef, orderId, callbackData = {}) {
    const merchantId = getEnv("EASYPAISA_MERCHANT_ID");
    const secretKey = getEnv("EASYPAISA_SECRET_KEY");

    if (!merchantId || !secretKey) {
      return {
        transactionRef,
        orderId,
        status: "pending",
        verified: false,
        message: "Easypaisa credentials not configured",
      };
    }

    // Easypaisa sends: signature, paymentStatus, responseCode in callback
    const receivedSignature = callbackData.signature;
    const paymentStatus = callbackData.paymentStatus || callbackData.status;
    const responseCode = callbackData.responseCode;

    if (!receivedSignature) {
      return {
        transactionRef,
        orderId,
        status: "pending",
        verified: false,
        message: "Missing Easypaisa callback signature",
      };
    }

    // Reconstruct the signature: HMAC-SHA256 of merchantId + orderId + amount
    const amount = callbackData.orderAmount || callbackData.amount || "";
    const signatureString = `${merchantId}${transactionRef}${amount}`;
    const expectedSignature = this._generateSignature(signatureString);

    // Constant-time comparison
    const sigValid = crypto.timingSafeEqual(
      Buffer.from(receivedSignature.toUpperCase(), "hex"),
      Buffer.from(expectedSignature, "hex")
    );

    if (!sigValid) {
      console.error("[Payment] Easypaisa signature mismatch for", transactionRef);
      return {
        transactionRef,
        orderId,
        status: "failed",
        verified: false,
        message: "Invalid Easypaisa callback signature",
      };
    }

    // Signature valid — check payment status
    let status;
    if (paymentStatus === "completed" || paymentStatus === "SUCCESS" || responseCode === "200") {
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
      message: `Easypaisa callback verified. Status: ${paymentStatus}`,
    };
  },

  /**
   * Verify Easypaisa callback signature (used by paymentController).
   * @param {object} callbackData - The full callback request body
   * @returns {boolean} true if signature is valid
   */
  verifyCallbackSignature(callbackData) {
    const secretKey = getEnv("EASYPAISA_SECRET_KEY");
    const merchantId = getEnv("EASYPAISA_MERCHANT_ID");
    if (!secretKey || !merchantId) return false;

    const receivedSignature = callbackData.signature;
    if (!receivedSignature) return false;

    const amount = callbackData.orderAmount || callbackData.amount || "";
    const orderId = callbackData.orderId || "";
    const signatureString = `${merchantId}${orderId}${amount}`;
    const expectedSignature = this._generateSignature(signatureString);

    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature.toUpperCase(), "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return false;
    }
  },
};
