/**
 * Tier 0 Tests — Authentication Utilities
 * Tests for OTP generation, token utilities, and auth helpers.
 */
import { describe, test, expect } from "@jest/globals";
import { generateOTP } from "../utils/sendEmail.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";

describe("OTP Generation", () => {
  test("generates a 6-digit number", () => {
    const otp = generateOTP();
    expect(typeof otp).toBe("number");
    expect(otp).toBeGreaterThanOrEqual(100000);
    expect(otp).toBeLessThanOrEqual(999999);
  });

  test("generates different values on successive calls", () => {
    const otps = new Set();
    for (let i = 0; i < 20; i++) {
      otps.add(generateOTP());
    }
    // With 1M possible values and 20 calls, collision is extremely unlikely
    expect(otps.size).toBeGreaterThan(1);
  });
});

describe("createError", () => {
  test("creates error with status, message, and code", () => {
    const err = createError(400, "Bad request", "INVALID_INPUT");
    expect(err.status).toBe(400);
    expect(err.message).toBe("Bad request");
    expect(err.code).toBe("INVALID_INPUT");
  });

  test("creates error without code", () => {
    const err = createError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.code).toBeUndefined();
  });
});

describe("createSuccess", () => {
  test("creates success response with default empty data", () => {
    const res = createSuccess(200, "OK");
    expect(res.status).toBe(200);
    expect(res.message).toBe("OK");
    expect(res.data).toEqual({});
  });

  test("creates success response with data", () => {
    const data = { users: [{ id: 1 }] };
    const res = createSuccess(200, "Fetched", data);
    expect(res.data).toEqual(data);
  });
});
