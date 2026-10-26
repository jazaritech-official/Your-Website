/**
 * ============================================================
 * SHARED ORDER SHIPPING CALCULATION — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------------
 * Extracted verbatim from `orderController.createOrder` so that every
 * server-side caller (order creation, change-location recalculation, and any
 * future admin adjustment) resolves shipping through ONE implementation
 * instead of a copy that can silently drift.
 *
 * The storefront's display estimate (`Frontend/src/app/utils/shipping.ts`)
 * mirrors these exact rules — keep the two in step.
 *
 * PRECEDENCE (unchanged — this is the existing business rule):
 *   1. Any item with the per-product `freeShipping` flag  → free
 *   2. Subtotal at/above the free-shipping threshold       → free
 *   3. City-wise fee for the delivery city (if enabled)    → that city's fee
 *   4. Otherwise                                           → the HIGHEST
 *      single per-item fee, falling back to the store base `shippingFee`
 *      for items with no per-product fee. The order pays the maximum once —
 *      never the sum, never per unit.
 *
 * CITY MATCHING — why both sides are normalized:
 * The previous inline implementation relied on the *stored* value already
 * being lowercase (`c.city === city.trim().toLowerCase()`). Mongoose's
 * `lowercase: true` only applies on write, so any entry persisted before that
 * schema option existed — or written outside Mongoose's setters — keeps its
 * original casing and would NEVER match. The lookup then silently falls
 * through to the flat fee with no error, which is exactly the reported
 * "checkout shows the wrong/default amount" symptom. Normalizing BOTH sides
 * makes the match independent of how the row happens to be stored.
 */

/** Case/whitespace-insensitive city name for comparison only. */
export const normalizeCityName = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/**
 * Coerce a Settings document into the normalized shape the calculator uses.
 * Identical coercions to the previous inline block (including the
 * `!== false` treatment of the progress-bar toggle).
 */
export const normalizeShippingSettings = (settingsDoc) => ({
  shippingFee: Math.max(0, Number(settingsDoc?.shippingFee) || 0),
  freeShippingThreshold: Math.max(
    0,
    Number(settingsDoc?.freeShippingThreshold) || 0,
  ),
  freeShippingProgressBarEnabled:
    settingsDoc?.freeShippingProgressBarEnabled !== false,
  cityShipping: Array.isArray(settingsDoc?.cityShipping)
    ? settingsDoc.cityShipping
    : [],
  cityShippingEnabled: settingsDoc?.cityShippingEnabled === true,
});

/**
 * The city-wise fee for a delivery city, or `null` when city-wise shipping is
 * off / the city is empty / nothing matches. Disabled entries are skipped.
 * Falls back to the single entry flagged `isDefault` when no city matches.
 */
export function getCityShippingCharge(city, settings) {
  if (!settings || settings.cityShippingEnabled !== true) return null;
  const normalizedCity = normalizeCityName(city);
  if (!normalizedCity) return null;
  const activeEntries = (settings.cityShipping || []).filter(
    (entry) => entry && entry.enabled !== false,
  );
  const cityEntry = activeEntries.find(
    (entry) => normalizeCityName(entry.city) === normalizedCity,
  );
  if (cityEntry) return Math.max(0, Number(cityEntry.charge) || 0);
  const defaultEntry = activeEntries.find((entry) => entry.isDefault === true);
  if (defaultEntry) return Math.max(0, Number(defaultEntry.charge) || 0);
  return null;
}

/**
 * Resolve the shipping charge for a set of order lines.
 *
 * @param items    Array of `{ freeShipping?, shippingCharge? }` — one per line.
 *                 Callers pass the RESOLVED per-line values (server: the
 *                 re-fetched Product documents).
 * @param subtotal Server-computed items subtotal.
 * @param settings A Settings doc, or the output of normalizeShippingSettings().
 * @param city     The delivery city (free text).
 * @returns `{ shipping, source }` — `source` is for auditing/reporting only and
 *          never affects the amount.
 */
export function calculateOrderShipping({ items, subtotal, settings, city }) {
  const resolved =
    settings && settings.cityShipping !== undefined
      ? settings
      : normalizeShippingSettings(settings);
  const lines = Array.isArray(items) ? items : [];

  if (lines.some((item) => item?.freeShipping === true)) {
    return { shipping: 0, source: "product-free-shipping" };
  }

  const thresholdQualifies =
    resolved.freeShippingProgressBarEnabled &&
    resolved.freeShippingThreshold > 0 &&
    subtotal >= resolved.freeShippingThreshold;

  if (thresholdQualifies) {
    return { shipping: 0, source: "free-shipping-threshold" };
  }

  const cityCharge = getCityShippingCharge(city, resolved);
  if (cityCharge !== null) {
    return { shipping: cityCharge, source: "city-wise" };
  }

  const highestItemFee = lines.reduce(
    (max, item) =>
      Math.max(
        max,
        Math.max(0, Number(item?.shippingCharge) || resolved.shippingFee),
      ),
    0,
  );

  return { shipping: highestItemFee, source: "per-product-or-base-fee" };
}

/**
 * Has this order had money collected online already?
 *
 * "Cash on Delivery" is the store's default paymentMethod string, so anything
 * else that is also marked `paid` went through a gateway and is settled.
 */
export const isPaidOnlineOrder = (order) =>
  Boolean(order) &&
  order.paymentMethod !== "Cash on Delivery" &&
  order.paymentStatus === "paid";

/**
 * Decide what a change of delivery city means for an already-placed order.
 *
 * Pure and side-effect free so the money rule is unit-testable without a
 * database. `order` only needs `shippingPrice`, `paymentMethod` and
 * `paymentStatus`.
 *
 * A settled online payment is REFUSED when the fee would move: the gateway
 * capture cannot be re-priced in this pass (no automatic partial refund or
 * extra charge is built), so the customer is routed to support instead. A city
 * change that leaves the fee identical is allowed — it has no payment impact.
 */
export function evaluateCityShippingChange({
  order,
  currentCity,
  requestedCity,
  nextShippingFee,
}) {
  const from = Math.max(0, Number(order?.shippingPrice) || 0);
  const to = Math.max(0, Number(nextShippingFee) || 0);
  const difference = Math.round((to - from) * 100) / 100;

  const change = {
    cityChanged: true,
    fromCity: String(currentCity || "").trim(),
    toCity: String(requestedCity || "").trim(),
    from,
    to,
    difference,
    blocked: false,
    reason: "",
  };

  if (difference !== 0 && isPaidOnlineOrder(order)) {
    change.blocked = true;
    change.reason =
      `This order was already paid online, and moving it to ${change.toCity} ` +
      `would change the shipping fee from Rs ${from} to Rs ${to}. ` +
      `Please contact support to change the delivery city on a paid order.`;
  }

  return change;
}
