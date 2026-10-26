/**
 * Shared storefront shipping logic — MUST stay in sync with the authoritative
 * server-side calculation in Backend/Controllers/orderController.js
 * (createOrder). The checkout display and the backend order charge always
 * agree because both use these exact rules:
 *
 *  1. Any cart item with the per-product `freeShipping` flag → order ships free.
 *  2. Order subtotal at/above the admin free-shipping threshold (feature
 *     enabled) → order ships free.
 *  3. City-wise shipping: if enabled and the customer's city matches a
 *     configured city entry, use that city's charge.
 *  4. Otherwise → shipping is the HIGHEST SINGLE per-product
 *     `shippingCharge` among the cart lines, falling back to the store base
 *     shipping fee for products with no per-product fee configured. The
 *     order pays the maximum fee once — never the sum, never per-unit.
 */
import axios from "axios";
import { baseUrl } from "./commonFunctions";

export interface CityShippingEntry {
  city: string;
  charge: number;
  enabled: boolean;
  isDefault?: boolean;
}

export interface ShippingSettings {
  shippingFee: number;
  freeShippingThreshold: number;
  freeShippingProgressBarEnabled: boolean;
  cityShipping: CityShippingEntry[];
  cityShippingEnabled: boolean;
}

// Module-level cache: GET /settings is fetched once per session (5-min TTL)
// and shared across the Cart + Checkout mounts.
let cachedSettings: ShippingSettings | null = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

/** Fetch store settings once per session. Fail-safe: returns null on error. */
export async function getShippingSettings(): Promise<ShippingSettings | null> {
  const now = Date.now();
  if (cachedSettings && now - cachedAt < TTL_MS) return cachedSettings;
  try {
    const res = await axios.get(`${baseUrl}settings`);
    const data = res.data?.data ?? null;
    if (data) {
      cachedSettings = {
        shippingFee: Math.max(0, Number(data.shippingFee) || 0),
        freeShippingThreshold: Math.max(
          0,
          Number(data.freeShippingThreshold) || 0,
        ),
        freeShippingProgressBarEnabled:
          data.freeShippingProgressBarEnabled !== false,
        cityShipping: Array.isArray(data.cityShipping) ? data.cityShipping : [],
        cityShippingEnabled: data.cityShippingEnabled === true,
      };
      cachedAt = Date.now();
    }
    return cachedSettings;
  } catch {
    // Fail-safe: settings unreachable → keep prior cache (or null → 0 fee).
    return cachedSettings;
  }
}

/**
 * Drop the module-level cache so the next read refetches immediately.
 *
 * Called right after an admin saves the store settings so a toggle (e.g. the
 * free-shipping progress bar) takes effect on the storefront within the same
 * browser session instead of waiting out the TTL. Purely a client freshness
 * helper — the server cache is invalidated by the settings controller.
 */
export function invalidateShippingSettingsCache() {
  cachedSettings = null;
  cachedAt = 0;
}

/**
 * Compute the shipping cost for a cart — identical logic to the backend.
 * Returns 0 (free) when no settings are available yet, matching the store's
 * previous always-free behavior until settings load.
 */
export function calculateShipping(
  items: Array<{ freeShipping?: boolean; shippingCharge?: number }>,
  subtotal: number,
  settings: ShippingSettings | null,
): number {
  if (!settings) return 0;
  // Strict `=== true` — exact parity with the backend's product.freeShipping
  // check (values are already normalized to booleans everywhere).
  if (items.some((item) => item.freeShipping === true)) return 0;
  if (
    settings.freeShippingProgressBarEnabled &&
    settings.freeShippingThreshold > 0 &&
    subtotal >= settings.freeShippingThreshold
  ) {
    return 0;
  }
  // Charge the HIGHEST single fee: each cart line's effective fee is its
  // per-product shippingCharge, falling back to the store base shipping fee
  // when the product has no per-product fee configured (shippingCharge
  // 0/undefined). Missing/invalid values are ignored via Math.max(0, ...).
  // Empty cart / no valid fees → 0 (never NaN).
  return items.reduce(
    (max, item) =>
      Math.max(max, Math.max(0, Number(item.shippingCharge) || settings.shippingFee)),
    0,
  );
}

/**
 * Compute the city-wise shipping charge for a given city.
 * Returns the configured charge if found, the default entry's charge if
 * a default is configured, or null if no city match and no default.
 */
/**
 * Normalize a city name for COMPARISON only — never for display.
 *
 * Both sides of every comparison must go through this. The stored entry is
 * NOT guaranteed to be lowercase: Mongoose's `lowercase: true` only applies on
 * write, so rows persisted before that option existed keep their original
 * casing. Comparing a normalized input against a raw stored value silently
 * fails for those rows and drops the whole order through to the flat fee with
 * no error — the reported "checkout shows the wrong/default amount" bug.
 * Mirrors `normalizeCityName` in Backend/utils/shipping.js.
 */
export const normalizeCityName = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** City-wise fee for a delivery city; null when off / unmatched. */
export function getCityShippingCharge(
  city: string,
  settings: ShippingSettings | null,
): number | null {
  if (!settings || !settings.cityShippingEnabled) return null;
  const normalizedCity = normalizeCityName(city);
  if (!normalizedCity) return null;
  const activeEntries = settings.cityShipping.filter(
    (c) => c && c.enabled !== false,
  );
  // 1. Matching city
  const entry = activeEntries.find(
    (c) => normalizeCityName(c.city) === normalizedCity,
  );
  if (entry) {
    return Math.max(0, Number(entry.charge) || 0);
  }
  // 2. Fallback to default entry (isDefault flag)
  const defaultEntry = activeEntries.find((c) => c.isDefault === true);
  if (defaultEntry) {
    return Math.max(0, Number(defaultEntry.charge) || 0);
  }
  return null;
}

/**
 * Compute the total shipping for checkout, considering city-wise shipping.
 * Priority: free shipping flags → threshold → city-wise → per-product/base.
 */
export function calculateCheckoutShipping(
  items: Array<{ freeShipping?: boolean; shippingCharge?: number }>,
  subtotal: number,
  settings: ShippingSettings | null,
  city: string,
): number {
  if (!settings) return 0;
  if (items.some((item) => item.freeShipping === true)) return 0;
  if (
    settings.freeShippingProgressBarEnabled &&
    settings.freeShippingThreshold > 0 &&
    subtotal >= settings.freeShippingThreshold
  ) {
    return 0;
  }
  // City-wise shipping takes priority when configured and matching
  const cityCharge = getCityShippingCharge(city, settings);
  if (cityCharge !== null) return cityCharge;

  // Fall back to per-product/base fee
  return calculateShipping(items, subtotal, settings);
}
