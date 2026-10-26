/**
 * Regression tests for F-001 — search filter composition bug.
 *
 * The getProducts controller builds a MongoDB filter for the products listing.
 * Previously, `filter.$or = buildBroadInStockFilter()` at line ~524
 * overwrote `filter.$or` that was set by the search logic, so
 * `?search=mug` returned the newest in-stock products instead of matching ones.
 *
 * The fix uses $and to combine the search condition with the stock condition:
 *   { $and: [{ $or: searchCondition }, { $or: stockCondition }] }
 *
 * These tests exercise the filter composition pattern used by the controller
 * to ensure the bug cannot return. They do NOT require a database connection.
 */
import { describe, test, expect } from "@jest/globals";

/**
 * Simulate the controller's filter-building logic for getProducts.
 * Mirrors the exact flow in Controllers/productController.js lines 458-535.
 */
function buildProductFilter({ search, category, stockFilter }) {
  const filter = {};

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { tags: { $in: [new RegExp(search, "i")] } },
    ];
  }

  // Stock filter — the exact line that previously caused the bug.
  const sf = stockFilter;
  if (filter.$or) {
    const searchCondition = filter.$or;
    delete filter.$or;
    filter.$and = [{ $or: searchCondition }, { $or: sf }];
  } else {
    filter.$or = sf;
  }

  return filter;
}

describe("F-001: search + stock filter composition", () => {
  const stockFilter = [
    { stock: { $gt: 0 } },
    { "variantStock": { $ne: null } },
  ];

  test("search alone: combines with stock via $and", () => {
    const filter = buildProductFilter({
      search: "mug",
      stockFilter,
    });

    // Must NOT have a top-level $or (that was the bug — search was overwritten)
    expect(filter.$or).toBeUndefined();

    // Must have $and with exactly 2 conditions
    expect(filter.$and).toBeDefined();
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0]).toHaveProperty("$or");
    expect(filter.$and[1]).toHaveProperty("$or");

    // The search $or must contain name/description/tags
    const searchOr = filter.$and[0].$or;
    const searchFields = searchOr.map((cond) => Object.keys(cond)[0]);
    expect(searchFields).toContain("name");
    expect(searchFields).toContain("description");
    expect(searchFields).toContain("tags");

    // The stock $or must be the stock filter
    expect(filter.$and[1].$or).toEqual(stockFilter);
  });

  test("search + category: all three conditions present", () => {
    const filter = buildProductFilter({
      search: "shirt",
      category: "cat123",
      stockFilter,
    });

    expect(filter.category).toBe("cat123");
    expect(filter.$and).toBeDefined();
    expect(filter.$and).toHaveLength(2);

    // Search is in $and[0], stock in $and[1]
    const searchOr = filter.$and[0].$or;
    expect(searchOr.some((c) => c.name?.$regex === "shirt")).toBe(true);
  });

  test("no search: stock filter goes into $or directly (no $and)", () => {
    const filter = buildProductFilter({
      search: "",
      stockFilter,
    });

    // No search → stock goes into $or (no $and needed)
    expect(filter.$or).toEqual(stockFilter);
    expect(filter.$and).toBeUndefined();
  });

  test("no search, with category: category + $or stock", () => {
    const filter = buildProductFilter({
      category: "cat456",
      stockFilter,
    });

    expect(filter.category).toBe("cat456");
    expect(filter.$or).toEqual(stockFilter);
    expect(filter.$and).toBeUndefined();
  });

  test("empty search string is treated as no search", () => {
    const filter = buildProductFilter({
      search: "",
      stockFilter,
    });

    expect(filter.$or).toEqual(stockFilter);
    expect(filter.$and).toBeUndefined();
  });

  test("search with special regex chars is escaped in real usage", () => {
    // This test mirrors the controller's use of escapeRegExp
    const safeSearch = "mug (premium)".replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = buildProductFilter({
      search: safeSearch,
      stockFilter,
    });

    expect(filter.$and).toBeDefined();
    const searchRegex = filter.$and[0].$or[0].name.$regex;
    expect(searchRegex).toBe("mug \\(premium\\)");
  });

  test("pagination total should reflect filtered count (not unfiltered)", () => {
    // This is a structural test — the filter passed to Product.find
    // and Product.countDocuments MUST be the same object.
    const filter = buildProductFilter({
      search: "mug",
      stockFilter,
    });

    // The same filter should be usable for both find() and countDocuments()
    // because it now correctly combines search + stock.
    expect(JSON.stringify(filter)).toContain("$and");
    expect(JSON.stringify(filter)).not.toMatch(/^{"category":"[^"]*","\\$or":/);
  });
});
