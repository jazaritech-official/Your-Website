/**
 * Shared order-shipping calculation tests.
 *
 * These pin the EXISTING precedence rules (so a future edit cannot silently
 * change what customers are charged) and, most importantly, the city-matching
 * robustness fix: the lookup must work no matter how the stored city name
 * happens to be cased, because Mongoose's `lowercase: true` only applies on
 * write and pre-existing rows can carry capitals.
 */
import { describe, test, expect } from "@jest/globals";
import {
  normalizeCityName,
  normalizeShippingSettings,
  getCityShippingCharge,
  calculateOrderShipping,
  isPaidOnlineOrder,
  evaluateCityShippingChange,
} from "../utils/shipping.js";

const settings = (overrides = {}) =>
  normalizeShippingSettings({
    shippingFee: 200,
    freeShippingThreshold: 5000,
    freeShippingProgressBarEnabled: true,
    cityShippingEnabled: true,
    cityShipping: [
      { city: "karachi", charge: 150, enabled: true },
      { city: "lahore", charge: 250, enabled: true },
      { city: "multan", charge: 900, enabled: false },
    ],
    ...overrides,
  });

describe("normalizeCityName", () => {
  test.each([
    ["Lahore", "lahore"],
    ["  LAHORE  ", "lahore"],
    ["lahore", "lahore"],
    [undefined, ""],
    [null, ""],
    [42, ""],
  ])("normalizes %p → %p", (input, expected) => {
    expect(normalizeCityName(input)).toBe(expected);
  });
});

describe("getCityShippingCharge — city matching", () => {
  test("matches regardless of the customer's casing/whitespace", () => {
    const s = settings();
    expect(getCityShippingCharge("Lahore", s)).toBe(250);
    expect(getCityShippingCharge("  LAHORE ", s)).toBe(250);
    expect(getCityShippingCharge("lahore", s)).toBe(250);
  });

  /**
   * THE regression test for the reported bug: a row stored BEFORE the schema's
   * `lowercase: true` existed keeps its capitalisation. The old one-sided
   * comparison (`c.city === city.trim().toLowerCase()`) missed it and silently
   * charged the flat fee instead.
   */
  test("matches stored entries that were never lowercased", () => {
    const s = normalizeShippingSettings({
      shippingFee: 200,
      cityShippingEnabled: true,
      cityShipping: [
        { city: "Lahore", charge: 250, enabled: true },
        { city: "KARACHI", charge: 150, enabled: true },
      ],
    });
    expect(getCityShippingCharge("lahore", s)).toBe(250);
    expect(getCityShippingCharge("Karachi", s)).toBe(150);
    expect(getCityShippingCharge("LAHORE", s)).toBe(250);
  });

  test("ignores disabled entries", () => {
    const s = settings();
    expect(getCityShippingCharge("multan", s)).toBeNull();
  });

  test("falls back to the isDefault entry when no city matches", () => {
    const s = normalizeShippingSettings({
      shippingFee: 200,
      cityShippingEnabled: true,
      cityShipping: [
        { city: "karachi", charge: 150, enabled: true },
        { city: "other", charge: 400, enabled: true, isDefault: true },
      ],
    });
    expect(getCityShippingCharge("quetta", s)).toBe(400);
  });

  test("returns null when city-wise shipping is disabled or the city is empty", () => {
    expect(getCityShippingCharge("lahore", settings({ cityShippingEnabled: false }))).toBeNull();
    expect(getCityShippingCharge("", settings())).toBeNull();
    expect(getCityShippingCharge("   ", settings())).toBeNull();
    expect(getCityShippingCharge("lahore", null)).toBeNull();
  });
});

describe("calculateOrderShipping — precedence (must not change)", () => {
  const items = [{ shippingCharge: 0 }, { shippingCharge: 0 }];

  test("1. per-product free-shipping flag wins over everything", () => {
    const out = calculateOrderShipping({
      items: [{ freeShipping: true, shippingCharge: 999 }],
      subtotal: 100,
      settings: settings(),
      city: "lahore",
    });
    expect(out.shipping).toBe(0);
    expect(out.source).toBe("product-free-shipping");
  });

  test("2. free-shipping threshold wins over city-wise", () => {
    const out = calculateOrderShipping({
      items,
      subtotal: 5000,
      settings: settings(),
      city: "lahore",
    });
    expect(out.shipping).toBe(0);
    expect(out.source).toBe("free-shipping-threshold");
  });

  test("2b. threshold does not apply when below it or when the toggle is off", () => {
    expect(
      calculateOrderShipping({ items, subtotal: 4999, settings: settings(), city: "lahore" }).shipping,
    ).toBe(250);
    expect(
      calculateOrderShipping({
        items,
        subtotal: 9999,
        settings: settings({ freeShippingProgressBarEnabled: false }),
        city: "lahore",
      }).shipping,
    ).toBe(250);
  });

  test("3. city-wise fee applies for the matched city", () => {
    expect(
      calculateOrderShipping({ items, subtotal: 100, settings: settings(), city: "Lahore" }),
    ).toEqual({ shipping: 250, source: "city-wise" });
    expect(
      calculateOrderShipping({ items, subtotal: 100, settings: settings(), city: "karachi" }).shipping,
    ).toBe(150);
  });

  test("4. unmatched city falls back to the base fee", () => {
    const out = calculateOrderShipping({
      items,
      subtotal: 100,
      settings: settings(),
      city: "quetta",
    });
    expect(out.shipping).toBe(200);
    expect(out.source).toBe("per-product-or-base-fee");
  });

  test("4b. an unmatched city WITH a default entry gets the default fee", () => {
    const out = calculateOrderShipping({
      items,
      subtotal: 100,
      settings: settings({
        cityShipping: [
          { city: "lahore", charge: 250, enabled: true },
          { city: "other", charge: 400, enabled: true, isDefault: true },
        ],
      }),
      city: "quetta",
    });
    expect(out.shipping).toBe(400);
  });

  test("4c. charges the HIGHEST single per-item fee once — never the sum", () => {
    const out = calculateOrderShipping({
      items: [{ shippingCharge: 120 }, { shippingCharge: 300 }, { shippingCharge: 90 }],
      subtotal: 100,
      settings: normalizeShippingSettings({ shippingFee: 200, cityShippingEnabled: false }),
      city: "",
    });
    // max(300) — not 120+300+90
    expect(out.shipping).toBe(300);
  });

  test("4d. items with no per-product fee fall back to the base fee", () => {
    const out = calculateOrderShipping({
      items: [{ shippingCharge: 0 }, { shippingCharge: undefined }],
      subtotal: 100,
      settings: normalizeShippingSettings({ shippingFee: 200, cityShippingEnabled: false }),
      city: "",
    });
    expect(out.shipping).toBe(200);
  });

  test("empty cart never produces NaN", () => {
    const out = calculateOrderShipping({
      items: [],
      subtotal: 0,
      settings: settings(),
      city: "lahore",
    });
    expect(Number.isNaN(out.shipping)).toBe(false);
    expect(out.shipping).toBe(250); // city-wise still resolves
  });
});

describe("isPaidOnlineOrder", () => {
  test.each([
    [{ paymentMethod: "Cash on Delivery", paymentStatus: "paid" }, false],
    [{ paymentMethod: "Cash on Delivery", paymentStatus: "pending" }, false],
    [{ paymentMethod: "JazzCash", paymentStatus: "paid" }, true],
    [{ paymentMethod: "EasyPaisa", paymentStatus: "paid" }, true],
    [{ paymentMethod: "Meezan", paymentStatus: "paid" }, true],
    // Online method chosen but the gateway never settled → not paid yet.
    [{ paymentMethod: "JazzCash", paymentStatus: "pending" }, false],
    [{ paymentMethod: "JazzCash", paymentStatus: "failed" }, false],
    [{ paymentMethod: "JazzCash", paymentStatus: "refunded" }, false],
    [null, false],
  ])("%p → %p", (order, expected) => {
    expect(isPaidOnlineOrder(order)).toBe(expected);
  });
});

describe("evaluateCityShippingChange — the money rule", () => {
  const codOrder = {
    shippingPrice: 200,
    paymentMethod: "Cash on Delivery",
    paymentStatus: "pending",
  };

  test("reports the exact before/after and the difference", () => {
    const out = evaluateCityShippingChange({
      order: codOrder,
      currentCity: "Karachi",
      requestedCity: "Lahore",
      nextShippingFee: 350,
    });
    expect(out).toMatchObject({
      cityChanged: true,
      fromCity: "Karachi",
      toCity: "Lahore",
      from: 200,
      to: 350,
      difference: 150,
      blocked: false,
      reason: "",
    });
  });

  test("a DECREASE is allowed and reported as negative", () => {
    const out = evaluateCityShippingChange({
      order: codOrder,
      currentCity: "Lahore",
      requestedCity: "Karachi",
      nextShippingFee: 150,
    });
    expect(out.difference).toBe(-50);
    expect(out.blocked).toBe(false);
  });

  test("COD orders are never blocked by a fee change", () => {
    const out = evaluateCityShippingChange({
      order: codOrder,
      currentCity: "Karachi",
      requestedCity: "Lahore",
      nextShippingFee: 900,
    });
    expect(out.blocked).toBe(false);
  });

  test("a PAID ONLINE order is blocked when the fee moves, with an explanatory reason", () => {
    const out = evaluateCityShippingChange({
      order: {
        shippingPrice: 200,
        paymentMethod: "JazzCash",
        paymentStatus: "paid",
      },
      currentCity: "Karachi",
      requestedCity: "Lahore",
      nextShippingFee: 350,
    });
    expect(out.blocked).toBe(true);
    expect(out.reason).toContain("already paid online");
    expect(out.reason).toContain("contact support");
    expect(out.reason).toContain("350");
  });

  test("a PAID ONLINE order moving to a city with the SAME fee is allowed", () => {
    const out = evaluateCityShippingChange({
      order: {
        shippingPrice: 250,
        paymentMethod: "EasyPaisa",
        paymentStatus: "paid",
      },
      currentCity: "Karachi",
      requestedCity: "Lahore",
      nextShippingFee: 250,
    });
    expect(out.difference).toBe(0);
    expect(out.blocked).toBe(false);
  });

  test("an online method that never settled is not treated as paid", () => {
    const out = evaluateCityShippingChange({
      order: {
        shippingPrice: 200,
        paymentMethod: "JazzCash",
        paymentStatus: "pending",
      },
      currentCity: "Karachi",
      requestedCity: "Lahore",
      nextShippingFee: 350,
    });
    expect(out.blocked).toBe(false);
  });
});

describe("normalizeShippingSettings", () => {
  test("coerces the documented Settings shape", () => {
    const out = normalizeShippingSettings({
      shippingFee: "150",
      freeShippingThreshold: "5000",
      freeShippingProgressBarEnabled: false,
      cityShippingEnabled: true,
      cityShipping: [{ city: "lahore", charge: 250 }],
    });
    expect(out).toEqual({
      shippingFee: 150,
      freeShippingThreshold: 5000,
      freeShippingProgressBarEnabled: false,
      cityShipping: [{ city: "lahore", charge: 250 }],
      cityShippingEnabled: true,
    });
  });

  test("defaults safely for a missing document", () => {
    const out = normalizeShippingSettings(undefined);
    expect(out.shippingFee).toBe(0);
    expect(out.freeShippingThreshold).toBe(0);
    expect(out.freeShippingProgressBarEnabled).toBe(true); // !== false
    expect(out.cityShipping).toEqual([]);
    expect(out.cityShippingEnabled).toBe(false);
  });
});
