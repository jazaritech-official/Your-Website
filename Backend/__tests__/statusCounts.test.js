/**
 * Tests — active-deliveries status counts (Admin Tracking stat cards).
 *
 * `buildStatusCounts` assembles the exact server-wide totals the dashboard
 * shows. If it holds, the stat cards can never report numbers derived from
 * only the current page of orders:
 *  - every active status key always exists (zero-filled)
 *  - aggregation groups override the zeros with real totals
 *  - `total` always matches the countDocuments total, independent of how
 *    many rows the paginated list response happens to contain
 */
import { describe, test, expect } from "@jest/globals";
import { buildStatusCounts } from "../utils/orderTrackingHelpers.js";

const ACTIVE = ["Shipped", "Out for Delivery", "Reached Destination"];

describe("buildStatusCounts", () => {
  test("zero-fills every active status when no groups are returned", () => {
    expect(buildStatusCounts(ACTIVE, 0)).toEqual({
      total: 0,
      Shipped: 0,
      "Out for Delivery": 0,
      "Reached Destination": 0,
    });
  });

  test("merges aggregation groups over the zero-filled defaults", () => {
    const counts = buildStatusCounts(ACTIVE, 37, [
      { _id: "Shipped", count: 25 },
      { _id: "Reached Destination", count: 4 },
      { _id: "Out for Delivery", count: 8 },
    ]);
    expect(counts).toEqual({
      total: 37,
      Shipped: 25,
      "Out for Delivery": 8,
      "Reached Destination": 4,
    });
  });

  test("statuses with no orders stay 0 even when other groups exist", () => {
    const counts = buildStatusCounts(ACTIVE, 5, [{ _id: "Shipped", count: 5 }]);
    expect(counts["Out for Delivery"]).toBe(0);
    expect(counts["Reached Destination"]).toBe(0);
    expect(counts.total).toBe(5);
  });

  test("total reflects all active orders, not the loaded page size", () => {
    // e.g. 100 rows loaded (page limit) but 137 active deliveries in total
    const counts = buildStatusCounts(ACTIVE, 137, [
      { _id: "Shipped", count: 100 },
      { _id: "Out for Delivery", count: 30 },
      { _id: "Reached Destination", count: 7 },
    ]);
    expect(counts.total).toBe(137);
    expect(counts["Out for Delivery"]).toBe(30);
  });

  test("tolerates null/undefined group input", () => {
    expect(buildStatusCounts(ACTIVE, 2, null)).toEqual({
      total: 2,
      Shipped: 0,
      "Out for Delivery": 0,
      "Reached Destination": 0,
    });
    expect(buildStatusCounts(undefined, 1)).toEqual({ total: 1 });
  });
});
