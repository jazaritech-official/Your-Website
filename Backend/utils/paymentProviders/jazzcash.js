import crypto from "crypto";

/* ===========================================================
   JAZZCASH PAYMENT PROVIDER
   Integration with JazzCash Online Payment Gateway.

   Required environment variables:
     JAZZCASH_MERCHANT_ID      - Merchant ID from JazzCash
     JAZZCASH_PASSWORD         - Merchant password
     JAZZCASH_RETURN_URL       - Return URL after payment
     JAZZCASH_NOTIFY_URL       - Webhook/callback URL

   The integration follows JazzCash's standard redirect flow:
     1. Server creates a signed payment request
     2. Customer is redirected to JazzCash payment page
     3. After payment, customer returns to return URL
     4. Server verifies payment status via API

   NOTE: This implementation uses the standard JazzCash
   integration pattern. The actual API endpoints should be
   configured via environment variables for flexibility.
   =========================================================== */

const getEnv = (key) => process.env[key] || "";

export const jazzcashProvider = {
  displayName: "JazzCash",

  isConfigured() {
    return !!(getEnv("JAZZCASH_MERCHANT_ID") && getEnv("JAZZCASH_PASSWORD"));
  },

  /**
   * Generate the payment request signature for JazzCash.
   * JazzCash uses MD5-based signature with a specific field order.
   */
  _generateSignature(params) {
    const secretKey = getEnv("JAZZCASH_PASSWORD");
    // JazzCash signature format: field values concatenated with &
    // The exact field order follows JazzCash documentation
    const fields = [
      params.pp_TxnRefNo,
      params.pp_Amount,
      params.pp_TxnDateTime,
      params.pp_BillReference,
      params.pp_Description,
      params.pp_MerchantID,
    ];
    const dataString = fields.join("&");
    return crypto
      .createHash("md5")
      .update(dataString + secretKey)
      .digest("hex")
      .toUpperCase();
  },

  /**
   * Initialize a JazzCash payment.
   * Returns the redirect URL for the customer.
   */
  async initializePayment(order, customerInfo) {
    const merchantId = getEnv("JAZZCASH_MERCHANT_ID");
    const returnUrl = getEnv("JAZZCASH_RETURN_URL");
    const notifyUrl = getEnv("JAZZCASH_NOTIFY_URL");

    if (!merchantId || !returnUrl) {
      throw new Error("JazzCash configuration incomplete");
    }

    const amount = Math.round(order.totalPrice * 100); // JazzCash uses paisa
    const txnRefNo = `JJ${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const txnDateTime = new Date().toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);
    const billReference = `ORD-${order.serialNumber || order._id}`;

    const params = {
      pp_MerchantID: merchantId,
      pp_Password: getEnv("JAZZCASH_PASSWORD"),
      pp_TxnRefNo: txnRefNo,
      pp_Amount: String(amount),
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: txnDateTime,
      pp_BillReference: billReference,
      pp_Description: `Payment for Order #${order.serialNumber || order._id}`,
      pp_ReturnURL: returnUrl,
      pp_NotifyURL: notifyUrl || undefined,
      pp_Language: "EN",
      // Additional fields
      ppmpf_1: String(order._id),
      ppmpf_2: customerInfo.phone || "",
      ppmpf_3: customerInfo.email || "",
    };

    // Generate signature
    params.pp_SecureHash = this._generateSignature(params);

    // Build redirect URL (JazzCash standard endpoint)
    const baseUrl = getEnv("JAZZCASH_API_URL") || "https://sandbox.paypak.net.pk/EDR/Service.svc";
    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    return {
      url: `${baseUrl}?${queryString}`,
      transactionRef: txnRefNo,
      params,
    };
  },

  /**
   * Verify a JazzCash payment callback.
   * Validates the callback signature to prevent forged completions.
   * Returns the verified payment status.
   *
   * @param {string} transactionRef - The transaction reference from the callback
   * @param {string} orderId - The internal order ID
   * @param {object} callbackData - The full callback request body from JazzCash
   * @returns {object} Verification result
   */
  async verifyPayment(transactionRef, orderId, callbackData = {}) {
    const merchantId = getEnv("JAZZCASH_MERCHANT_ID");
    const secretKey = getEnv("JAZZCASH_PASSWORD");

    if (!merchantId || !secretKey) {
      return {
        transactionRef,
        orderId,
        status: "pending",
        verified: false,
        message: "JazzCash credentials not configured",
      };
    }

    // JazzCash sends pp_ResponseCode, pp_TxnRefNo, pp_SecureHash in callback
    const pp_ResponseCode = callbackData.pp_ResponseCode;
    const pp_SecureHash = callbackData.pp_SecureHash;
    const pp_TxnRefNo = callbackData.pp_TxnRefNo;

    if (!pp_SecureHash || !pp_TxnRefNo) {
      return {
        transactionRef,
        orderId,
        status: "pending",
        verified: false,
        message: "Missing JazzCash callback signature fields",
      };
    }

    // Reconstruct the signature from callback fields
    // JazzCash signature: MD5 of concatenated fields + secret key
    const callbackFields = [
      pp_TxnRefNo,
      callbackData.pp_Amount || "",
      callbackData.pp_TxnDateTime || "",
      callbackData.pp_BillReference || "",
      callbackData.pp_Description || "",
      merchantId,
    ];
    const dataString = callbackFields.join("&");
    const expectedHash = crypto
      .createHash("md5")
      .update(dataString + secretKey)
      .digest("hex")
      .toUpperCase();

    // Constant-time comparison to prevent timing attacks
    const hashValid = crypto.timingSafeEqual(
      Buffer.from(pp_SecureHash.toUpperCase(), "hex"),
      Buffer.from(expectedHash, "hex")
    );

    if (!hashValid) {
      console.error("[Payment] JazzCash signature mismatch for", transactionRef);
      return {
        transactionRef,
        orderId,
        status: "failed",
        verified: false,
        message: "Invalid JazzCash callback signature",
      };
    }

    // Signature valid — check response code
    // JazzCash: 0000 = success, 7010 = pending, others = failed
    const successCodes = ["0000"];
    const pendingCodes = ["7010"];

    let status;
    if (successCodes.includes(pp_ResponseCode)) {
      status = "completed";
    } else if (pendingCodes.includes(pp_ResponseCode)) {
      status = "processing";
    } else {
      status = "failed";
    }

    return {
      transactionRef,
      orderId,
      status,
      verified: true,
      message: `JazzCash callback verified. Response code: ${pp_ResponseCode}`,
    };
  },

  /**
   * Verify a JazzCash callback signature (used by paymentController).
   * @param {object} callbackData - The full callback request body
   * @returns {boolean} true if signature is valid
   */
  verifyCallbackSignature(callbackData) {
    const secretKey = getEnv("JAZZCASH_PASSWORD");
    const merchantId = getEnv("JAZZCASH_MERCHANT_ID");
    if (!secretKey || !merchantId) return false;

    const pp_SecureHash = callbackData.pp_SecureHash;
    const pp_TxnRefNo = callbackData.pp_TxnRefNo;
    if (!pp_SecureHash || !pp_TxnRefNo) return false;

    const fields = [
      pp_TxnRefNo,
      callbackData.pp_Amount || "",
      callbackData.pp_TxnDateTime || "",
      callbackData.pp_BillReference || "",
      callbackData.pp_Description || "",
      merchantId,
    ];
    const dataString = fields.join("&");
    const expectedHash = crypto
      .createHash("md5")
      .update(dataString + secretKey)
      .digest("hex")
      .toUpperCase();

    try {
      return crypto.timingSafeEqual(
        Buffer.from(pp_SecureHash.toUpperCase(), "hex"),
        Buffer.from(expectedHash, "hex")
      );
    } catch {
      return false;
    }
  },
};
