/**
 * Centralized inventory helpers for variant-aware stock management.
 *
 * ──────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ──────────────────────────────────────────────────────────────────────
 *
 * NORMAL PRODUCT:
 *   Product-level `stock` is the source of truth.
 *
 * VARIANT-MANAGED PRODUCT (has entries in `variantStock`):
 *   Variant-level stock is the source of truth.
 *   The parent product's `stock` field is treated as a derived /
 *   compatibility value and is NEVER used as the availability source.
 *
 * The `variantStock` map is keyed the same way as `variantPricing`:
 *   "Color__Size"   e.g. "Black__M"
 *   "Size"          e.g. "M"  (when product has no colors)
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * Determine whether a product uses variant-based inventory.
 *
 * A product is considered variant-managed when its `variantStock` object
 * has at least one own-key entry. Legacy products created before this
 * feature simply have `{}` (or `undefined`) and fall through to the
 * normal product-level stock path.
 *
 * @param {object} product  Mongoose document or plain object
 * @returns {boolean}
 */
export function hasVariantInventory(product) {
  if (!product) return false;
  const vs = product.variantStock;
  if (!vs || typeof vs !== "object") return false;
  // Object.keys() is safe on Mongoose Mixed — it returns the stored keys.
  return Object.keys(vs).length > 0;
}

/**
 * Compute the total stock across all variants.
 *
 * Handles missing / null / NaN values gracefully (treated as 0) so the
 * calculation never produces NaN that could propagate into comparisons.
 *
 * @param {object} product  Mongoose document or plain object
 * @returns {number}        Total variant stock (>= 0)
 */
export function sumVariantStocks(product) {
  const vs = product?.variantStock;
  if (!vs || typeof vs !== "object") return 0;
  return Object.values(vs).reduce((sum, val) => {
    const n = Number(val);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/**
 * Get the effective (authoritative) stock for a product.
 *
 *  - Variant-managed → sum of all variant stocks
 *  - Normal           → product.stock
 *
 * @param {object} product  Mongoose document or plain object
 * @returns {number}        Effective stock (>= 0)
 */
export function getEffectiveStock(product) {
  if (hasVariantInventory(product)) {
    return sumVariantStocks(product);
  }
  const s = Number(product?.stock);
  return Number.isFinite(s) ? Math.max(0, s) : 0;
}

/**
 * Boolean: is the product purchasable (at least one unit available)?
 *
 * @param {object} product  Mongoose document or plain object
 * @returns {boolean}
 */
export function isProductInStock(product) {
  return getEffectiveStock(product) > 0;
}

/**
 * Get the stock for a SPECIFIC variant (color + size combination).
 *
 * Returns 0 for:
 *  - Products without variant inventory (caller should fall back to product.stock)
 *  - Missing / non-existent variant keys
 *  - NaN or negative stored values
 *
 * @param {object} product   Mongoose document or plain object
 * @param {string} [color]   Selected color (trimmed, case-sensitive to match stored key)
 * @param {string} [size]    Selected size
 * @returns {number}         Variant stock (>= 0)
 */
export function getVariantStock(product, color, size) {
  if (!hasVariantInventory(product)) return 0;
  const vs = product.variantStock || {};
  const c = (color || "").trim();
  const s = (size || "").trim();
  // Key format matches the admin panel / variantPricing convention
  const key = c && s ? `${c}__${s}` : s || c;
  if (!key) return 0;

  // Fast path: exact key match
  const val = Number(vs[key]);
  if (Number.isFinite(val) && val > 0) return val;

  // Fallback 1: when color+size key doesn't exist but size-only does,
  // use the size-only value. This handles categories where colors are
  // independent (e.g. T-Shirts) — variantStock stores size-only keys.
  if (c && s) {
    const sizeOnlyVal = Number(vs[s]);
    if (Number.isFinite(sizeOnlyVal) && sizeOnlyVal > 0) return sizeOnlyVal;
  }

  // Fallback 2: normalized match — trim + lowercase both the lookup key and
  // every stored key.  This catches whitespace / case mismatches that can
  // occur when stock was saved through a different path or with legacy data.
  const normKey = key.trim().toLowerCase();
  for (const [storedKey, storedVal] of Object.entries(vs)) {
    if (storedKey.trim().toLowerCase() === normKey) {
      const n = Number(storedVal);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
  }

  return 0;
}

/**
 * Resolve the actual stored variant key for a requested color+size combo.
 *
 * Returns the EXACT key present in variantStock (so MongoDB dot-notation
 * queries like `variantStock.<key>` target the right field).  Falls back
 * to the canonical key when no stored key matches.
 *
 * @param {object} product   Mongoose document or plain object
 * @param {string} [color]
 * @param {string} [size]
 * @returns {string}         The real stored key, or the canonical key
 */
export function resolveVariantKey(product, color, size) {
  const vs = product?.variantStock;
  if (!vs || typeof vs !== "object") return "";
  const c = (color || "").trim();
  const s = (size || "").trim();
  const canonical = c && s ? `${c}__${s}` : s || c;
  if (!canonical) return "";
  // Fast path: exact match
  if (vs[canonical] !== undefined) return canonical;
  // Fallback 1: size-only key (handles categories where colors are independent)
  if (c && s && vs[s] !== undefined) return s;
  // Fallback 2: normalized match
  const norm = canonical.trim().toLowerCase();
  for (const k of Object.keys(vs)) {
    if (k.trim().toLowerCase() === norm) return k;
  }
  return canonical;
}

/**
 * MongoDB $or filter that matches products which are in-stock via EITHER
 * the main `stock` field OR a non-empty `variantStock` map.
 *
 * Use this as a QUERY-LEVEL filter to avoid excluding variant-managed
 * products whose main stock is 0.  Post-filter the results with
 * `isProductInStock()` for accuracy (the broad filter may include
 * variant products where every variant is 0).
 *
 * @returns {Array<object>}  Array suitable for filter.$or
 */
export function buildBroadInStockFilter() {
  return [
    { stock: { $gt: 0 } },
    { variantStock: { $exists: true, $ne: {} } },
  ];
}

/**
 * Post-filter an array of products (plain objects or Mongoose docs) to
 * remove those where the effective stock is 0.
 *
 * Use AFTER a DB query that used `buildBroadInStockFilter()` to get
 * accurate availability results without an expensive aggregation pipeline.
 *
 * @param {Array<object>} products
 * @returns {Array<object>}  Filtered array (only in-stock products)
 */
export function filterInStockProducts(products) {
  return products.filter(isProductInStock);
}
