/**
 * Tier 0 Tests — Authorization Helpers
 * Tests for roleHelpers.js — pure logic, no DB dependencies.
 */
import { describe, test, expect } from "@jest/globals";
import {
  isAdmin,
  isSuperAdmin,
  isAdminOrAbove,
  isRider,
  isAdminOrRider,
  isOwnerOrAdmin,
  validateStatusTransition,
} from "../utils/roleHelpers.js";

describe("Role Helpers", () => {
  // ── isAdmin ──
  describe("isAdmin", () => {
    test("returns false for null/undefined", () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });

    test("returns false for regular user", () => {
      expect(isAdmin({ role: "user" })).toBe(false);
    });

    test("returns true for admin", () => {
      expect(isAdmin({ role: "admin" })).toBe(true);
    });

    test("returns true for superadmin", () => {
      expect(isAdmin({ role: "superadmin" })).toBe(true);
    });

    test("returns true for legacy isAdmin flag", () => {
      expect(isAdmin({ isAdmin: true })).toBe(true);
    });
  });

  // ── isSuperAdmin ──
  describe("isSuperAdmin", () => {
    test("returns false for regular user", () => {
      expect(isSuperAdmin({ role: "user" })).toBe(false);
    });

    test("returns false for admin", () => {
      expect(isSuperAdmin({ role: "admin" })).toBe(false);
    });

    test("returns true for superadmin", () => {
      expect(isSuperAdmin({ role: "superadmin" })).toBe(true);
    });
  });

  // ── isRider ──
  describe("isRider", () => {
    test("returns false for user", () => {
      expect(isRider({ role: "user" })).toBe(false);
    });

    test("returns true for rider", () => {
      expect(isRider({ role: "rider" })).toBe(true);
    });
  });

  // ── isAdminOrRider ──
  describe("isAdminOrRider", () => {
    test("returns false for user", () => {
      expect(isAdminOrRider({ role: "user" })).toBe(false);
    });

    test("returns true for admin", () => {
      expect(isAdminOrRider({ role: "admin" })).toBe(true);
    });

    test("returns true for rider", () => {
      expect(isAdminOrRider({ role: "rider" })).toBe(true);
    });
  });

  // ── isOwnerOrAdmin ──
  describe("isOwnerOrAdmin", () => {
    test("returns true when caller owns resource", () => {
      expect(isOwnerOrAdmin({ id: "abc123" }, "abc123")).toBe(true);
    });

    test("returns true when caller is admin", () => {
      expect(isOwnerOrAdmin({ id: "other", role: "admin" }, "abc123")).toBe(true);
    });

    test("returns false when not owner and not admin", () => {
      expect(isOwnerOrAdmin({ id: "other", role: "user" }, "abc123")).toBe(false);
    });
  });
});

describe("Order Status Transitions", () => {
  test("Pending → Processing is valid", () => {
    expect(validateStatusTransition("Pending", "Processing").valid).toBe(true);
  });

  test("Pending → Cancelled is valid", () => {
    expect(validateStatusTransition("Pending", "Cancelled").valid).toBe(true);
  });

  test("Delivered → any is invalid (terminal)", () => {
    expect(validateStatusTransition("Delivered", "Processing").valid).toBe(false);
    expect(validateStatusTransition("Delivered", "Shipped").valid).toBe(false);
    expect(validateStatusTransition("Delivered", "Cancelled").valid).toBe(false);
  });

  test("Cancelled → any is invalid (terminal)", () => {
    expect(validateStatusTransition("Cancelled", "Processing").valid).toBe(false);
  });

  test("Shipped → Out for Delivery is valid", () => {
    expect(validateStatusTransition("Shipped", "Out for Delivery").valid).toBe(true);
  });

  test("Shipped → Delivered is invalid (must go through Out for Delivery)", () => {
    expect(validateStatusTransition("Shipped", "Delivered").valid).toBe(false);
  });

  test("Out for Delivery → Delivered is valid", () => {
    expect(validateStatusTransition("Out for Delivery", "Delivered").valid).toBe(true);
  });

  test("Pending → Delivered is invalid (skipping steps)", () => {
    expect(validateStatusTransition("Pending", "Delivered").valid).toBe(false);
  });

  test("Unknown status returns invalid", () => {
    const result = validateStatusTransition("UnknownStatus", "Processing");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unknown");
  });
});
