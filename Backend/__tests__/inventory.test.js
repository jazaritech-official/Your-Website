/**
 * Tier 0 Tests — Inventory Helpers
 * Tests for inventory.js — pure logic, no DB dependencies.
 */
import { describe, test, expect } from "@jest/globals";
import {
  hasVariantInventory,
  sumVariantStocks,
  getEffectiveStock,
  isProductInStock,
  getVariantStock,
  resolveVariantKey,
} from "../utils/inventory.js";

describe("Inventory Helpers", () => {
  // ── hasVariantInventory ──
  describe("hasVariantInventory", () => {
    test("returns false for null product", () => {
      expect(hasVariantInventory(null)).toBe(false);
    });

    test("returns false for product without variantStock", () => {
      expect(hasVariantInventory({})).toBe(false);
    });

    test("returns false for empty variantStock", () => {
      expect(hasVariantInventory({ variantStock: {} })).toBe(false);
    });

    test("returns true for product with variantStock entries", () => {
      expect(hasVariantInventory({ variantStock: { "S": 10 } })).toBe(true);
    });
  });

  // ── sumVariantStocks ──
  describe("sumVariantStocks", () => {
    test("returns 0 for null product", () => {
      expect(sumVariantStocks(null)).toBe(0);
    });

    test("returns 0 for empty variantStock", () => {
      expect(sumVariantStocks({ variantStock: {} })).toBe(0);
    });

    test("sums all variant stocks correctly", () => {
      const product = { variantStock: { "S": 10, "M": 20, "L": 5 } };
      expect(sumVariantStocks(product)).toBe(35);
    });

    test("handles NaN/invalid values gracefully", () => {
      const product = { variantStock: { "S": 10, "M": "abc", "L": null } };
      expect(sumVariantStocks(product)).toBe(10);
    });
  });

  // ── getEffectiveStock ──
  describe("getEffectiveStock", () => {
    test("returns 0 for null product", () => {
      expect(getEffectiveStock(null)).toBe(0);
    });

    test("returns product.stock for non-variant product", () => {
      expect(getEffectiveStock({ stock: 50 })).toBe(50);
    });

    test("returns sum of variants for variant product", () => {
      const product = { stock: 50, variantStock: { "S": 10, "M": 20 } };
      expect(getEffectiveStock(product)).toBe(30);
    });

    test("returns 0 for negative stock", () => {
      expect(getEffectiveStock({ stock: -5 })).toBe(0);
    });
  });

  // ── isProductInStock ──
  describe("isProductInStock", () => {
    test("returns false for out of stock", () => {
      expect(isProductInStock({ stock: 0 })).toBe(false);
    });

    test("returns true for in stock", () => {
      expect(isProductInStock({ stock: 5 })).toBe(true);
    });
  });

  // ── getVariantStock ──
  describe("getVariantStock", () => {
    const product = {
      variantStock: { "S": 10, "M": 20, "Black__L": 5, "White__S": 8 },
    };

    test("returns 0 for non-variant product", () => {
      expect(getVariantStock({ variantStock: {} }, "", "S")).toBe(0);
    });

    test("resolves size-only key", () => {
      expect(getVariantStock(product, "", "S")).toBe(10);
    });

    test("resolves color+size key", () => {
      expect(getVariantStock(product, "Black", "L")).toBe(5);
    });

    test("returns 0 for non-existent variant", () => {
      expect(getVariantStock(product, "", "XXL")).toBe(0);
    });

    test("falls back to size-only when color+size not found", () => {
      // "Red__S" doesn't exist, but "S" does
      expect(getVariantStock(product, "Red", "S")).toBe(10);
    });
  });

  // ── resolveVariantKey ──
  describe("resolveVariantKey", () => {
    const product = {
      variantStock: { "S": 10, "Black__M": 5 },
    };

    test("resolves size-only key", () => {
      expect(resolveVariantKey(product, "", "S")).toBe("S");
    });

    test("resolves color+size key", () => {
      expect(resolveVariantKey(product, "Black", "M")).toBe("Black__M");
    });

    test("returns canonical key when stored key not found", () => {
      expect(resolveVariantKey(product, "Red", "L")).toBe("Red__L");
    });
  });
});
