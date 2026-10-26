/**
 * Shared shipping-address validation for order endpoints.
 *
 * EXTRACTED VERBATIM from `orderController.createOrder` so the customer
 * "change delivery location" endpoint enforces EXACTLY the same rules as
 * checkout — one source of truth instead of a second, slowly-drifting copy.
 * Error strings are preserved character-for-character so existing frontend
 * behaviour (and any test asserting on them) is unchanged.
 *
 * Rules:
 *  - fullName / phoneNo / address are required.
 *  - phoneNo must be a Pakistani mobile: 03XXXXXXXXX or +923XXXXXXXXX.
 *  - city / country fall back to the schema defaults ("Karachi" / "Pakistan")
 *    when blank, because a client-sent empty string would otherwise bypass the
 *    Mongoose `default` (defaults only apply when a field is absent).
 *  - optional GPS coordinates are range-checked.
 */

export const PAK_PHONE_REGEX = /^(03\d{9}|\+923\d{10})$/;

export const PAK_PHONE_ERROR =
  "Enter a valid Pakistani mobile number, e.g. 03001234567";

/**
 * Validate a raw (untrusted) shipping address payload.
 *
 * @param {unknown} shippingAddress - raw request body `shippingAddress`
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 *          `value` is the sanitised address safe to persist.
 */
export function validateShippingAddressInput(shippingAddress) {
  // Mirrors createOrder's own guard (`!shippingAddress || typeof !== "object"`)
  // so the two call sites respond to a malformed body identically.
  if (!shippingAddress || typeof shippingAddress !== "object") {
    return { ok: false, error: "Shipping address is required" };
  }

  const {
    fullName: rawFullName,
    phoneNo: rawPhoneNo,
    address: rawAddress,
    city: rawCity,
    country: rawCountry,
    latitude,
    longitude,
  } = shippingAddress;

  if (!rawFullName || !String(rawFullName).trim()) {
    return { ok: false, error: "Recipient full name is required" };
  }
  if (!rawPhoneNo || !String(rawPhoneNo).trim()) {
    return { ok: false, error: "Phone number is required" };
  }
  const phoneStr = String(rawPhoneNo).trim();
  if (!PAK_PHONE_REGEX.test(phoneStr)) {
    return { ok: false, error: PAK_PHONE_ERROR };
  }
  if (!rawAddress || !String(rawAddress).trim()) {
    return { ok: false, error: "Delivery address is required" };
  }

  const safeShippingAddress = {
    fullName: String(rawFullName).trim(),
    phoneNo: phoneStr,
    address: String(rawAddress).trim(),
    city:
      rawCity && String(rawCity).trim() ? String(rawCity).trim() : "Karachi",
    country:
      rawCountry && String(rawCountry).trim()
        ? String(rawCountry).trim()
        : "Pakistan",
  };

  if (latitude != null) {
    const lat = Number(latitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return { ok: false, error: "Invalid delivery latitude" };
    }
    safeShippingAddress.latitude = lat;
  }
  if (longitude != null) {
    const lng = Number(longitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return { ok: false, error: "Invalid delivery longitude" };
    }
    safeShippingAddress.longitude = lng;
  }

  return { ok: true, value: safeShippingAddress };
}

export default validateShippingAddressInput;
