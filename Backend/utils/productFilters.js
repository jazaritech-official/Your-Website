/**
 * Shared query-filter builders for product listings.
 *
 * Kept PURE (no mongoose/redis/model imports) so the filter logic can be
 * unit-tested directly and so find() and countDocuments() are guaranteed to
 * use the exact same filter object — page contents and totals can never
 * disagree (F-13).
 */

/** Escape user input before it is embedded in a RegExp (literal matching). */
export const escapeRegExp = (str = "") =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build the Mongo filter for the ADMIN product list (getAdminProducts).
 *
 * Identifier semantics (verified in Phase 3): `category` and `subcategory`
 * on a product are ObjectId REFERENCES, so both query params must be raw
 * ids — never slugs. The admin UI already sends ids taken from the real
 * Category/Subcategory collections.
 *
 * Category + subcategory together: the subcategory reference is
 * authoritative. A product's own `category` field can drift from its
 * subcategory's parent (legacy data); requiring product.category ===
 * category in that case would silently hide such products from a
 * subcategory listing, so when a subcategory is selected the category param
 * is treated as implied and is not re-applied.
 *
 * Admin listings intentionally have NO stock filter — admins must see
 * out-of-stock products too.
 *
 * @param {{ search?: string, category?: string, subcategory?: string }} query
 * @returns {object} a fresh Mongo filter object
 */
export const buildAdminProductFilter = ({ search, category, subcategory } = {}) => {
  const filter = {};

  if (subcategory) {
    filter.subcategory = String(subcategory);
  } else if (category) {
    filter.category = String(category);
  }

  if (search) {
    const safeSearch = escapeRegExp(search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { description: { $regex: safeSearch, $options: "i" } },
      { tags: { $in: [new RegExp(safeSearch, "i")] } },
    ];
  }

  return filter;
};
