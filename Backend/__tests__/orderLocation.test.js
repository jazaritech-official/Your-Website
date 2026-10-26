/**
 * Tests — customer "change delivery location" guards.
 *
 * Covers the two pure pieces that decide whether a location change is legal
 * and whether the submitted address is well-formed:
 *   1. `canChangeDeliveryLocation` (utils/roleHelpers.js)
 *   2. `validateShippingAddressInput` (utils/orderAddressValidation.js)
 *
 * These are the same functions the endpoint calls, so if they hold, the
 * server-side status / assignment / ownership guards hold.
 */
import { describe, test, expect } from "@jest/globals";
import {
  canChangeDeliveryLocation,
  LOCATION_CHANGEABLE_STATUSES,
} from "../utils/roleHelpers.js";
import {
  validateShippingAddressInput,
  PAK_PHONE_REGEX,
  PAK_PHONE_ERROR,
} from "../utils/orderAddressValidation.js";

const ALL_STATUSES = [
  "Pending",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
  "Cancelled",
];

const POST_DISPATCH = [
  "Shipped",
  "Out for Delivery",
  "Reached Destination",
  "Delivered",
  "Cancelled",
];

const orderAt = (status, extra = {}) => ({
  _id: "order-1",
  status,
  assignedRider: null,
  shippingAddress: { city: "Karachi", country: "Pakistan" },
  ...extra,
});

describe("canChangeDeliveryLocation — status gate", () => {
  test.each(LOCATION_CHANGEABLE_STATUSES)(
    "allows a pre-dispatch order in %s",
    (status) => {
      expect(canChangeDeliveryLocation(orderAt(status))).toEqual({
        allowed: true,
      });
    }
  );

  test.each(POST_DISPATCH)(
    "blocks an order that is already %s",
    (status) => {
      const result = canChangeDeliveryLocation(orderAt(status));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(status);
    }
  );

  test("changeable statuses are exactly the pre-dispatch subset", () => {
    // The allowed set must never contain a status that the order state
    // machine treats as shipped-or-later.
    LOCATION_CHANGEABLE_STATUSES.forEach((status) => {
      expect(ALL_STATUSES).toContain(status);
      expect(POST_DISPATCH).not.toContain(status);
    });
    // And no post-dispatch status may leak into the allowed set.
    expect([...LOCATION_CHANGEABLE_STATUSES].sort()).toEqual([
      "Packed",
      "Pending",
      "Processing",
    ]);
  });
});

describe("canChangeDeliveryLocation — rider assignment gate", () => {
  test.each(LOCATION_CHANGEABLE_STATUSES)(
    "blocks %s once a rider is assigned (admin can assign before shipping)",
    (status) => {
      const result = canChangeDeliveryLocation(
        orderAt(status, { assignedRider: "rider-123" })
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/rider/i);
    }
  );

  test("an assigned rider is treated as blocked even if the status looks early", () => {
    // assignRider has no status guard, so this combination is reachable.
    const result = canChangeDeliveryLocation(
      orderAt("Pending", { assignedRider: "rider-123" })
    );
    expect(result.allowed).toBe(false);
  });
});

describe("canChangeDeliveryLocation — degenerate input", () => {
  test("blocks a missing order", () => {
    expect(canChangeDeliveryLocation(null).allowed).toBe(false);
    expect(canChangeDeliveryLocation(undefined).allowed).toBe(false);
  });

  test.each([null, undefined, 0, ""])(
    "treats a falsy rider value (%p) as unassigned",
    (rider) => {
      expect(
        canChangeDeliveryLocation(orderAt("Pending", { assignedRider: rider }))
          .allowed
      ).toBe(true);
    }
  );

  test("treats any truthy rider value as an assignment", () => {
    expect(
      canChangeDeliveryLocation(orderAt("Pending", { assignedRider: "rider" }))
        .allowed
    ).toBe(false);
  });
});

describe("validateShippingAddressInput", () => {
  const valid = {
    fullName: "  Ali Khan  ",
    phoneNo: " 03001234567 ",
    address: "  House 12, Street 4 ",
    city: "Lahore",
    country: "Pakistan",
    latitude: 31.5204,
    longitude: 74.3587,
  };

  test("accepts and sanitises a well-formed address", () => {
    const result = validateShippingAddressInput(valid);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      fullName: "Ali Khan",
      phoneNo: "03001234567",
      address: "House 12, Street 4",
      city: "Lahore",
      country: "Pakistan",
      latitude: 31.5204,
      longitude: 74.3587,
    });
  });

  test("accepts the international PK mobile form", () => {
    expect(
      validateShippingAddressInput({ ...valid, phoneNo: "+9230012345678" }).ok
    ).toBe(true);
  });

  test("keeps the checkout phone rule as the single source of truth", () => {
    // The shared constant IS the rule — asserting its source guards against
    // the format drifting in one call site only (the whole point of
    // extracting it out of createOrder).
    expect(PAK_PHONE_REGEX.source).toBe(/^(03\d{9}|\+923\d{10})$/.source);
  });

  test("rejects a malformed phone with the checkout error copy", () => {
    const result = validateShippingAddressInput({ ...valid, phoneNo: "12345" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(PAK_PHONE_ERROR);
  });

  test.each([
    ["fullName", "Recipient full name is required"],
    ["phoneNo", "Phone number is required"],
    ["address", "Delivery address is required"],
  ])("rejects a missing %s", (field, message) => {
    const result = validateShippingAddressInput({ ...valid, [field]: "   " });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(message);
  });

  test("requires an address object at all", () => {
    expect(validateShippingAddressInput(null).error).toBe(
      "Shipping address is required"
    );
    expect(validateShippingAddressInput("nope").error).toBe(
      "Shipping address is required"
    );
  });

  test("falls back to the schema defaults for a blank city/country", () => {
    const result = validateShippingAddressInput({
      ...valid,
      city: "",
      country: "  ",
    });
    expect(result.value.city).toBe("Karachi");
    expect(result.value.country).toBe("Pakistan");
  });

  test("omits coordinates entirely when none were supplied (legacy orders)", () => {
    const { latitude, longitude, ...noCoords } = valid;
    const result = validateShippingAddressInput(noCoords);
    expect(result.ok).toBe(true);
    expect("latitude" in result.value).toBe(false);
    expect("longitude" in result.value).toBe(false);
  });

  test.each([
    ["latitude", 999],
    ["latitude", "abc"],
    ["longitude", 999],
    ["longitude", "abc"],
  ])("range-checks %s (%p)", (field, bad) => {
    const result = validateShippingAddressInput({ ...valid, [field]: bad });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid delivery/);
  });
});
