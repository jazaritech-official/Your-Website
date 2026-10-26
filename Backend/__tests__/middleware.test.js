/**
 * Tier 0 Tests — Middleware & Utilities
 * Tests for requestId middleware and structured logger.
 */
import { describe, test, expect, jest } from "@jest/globals";
import { requestIdMiddleware } from "../middlewares/requestId.js";
import { logger } from "../utils/logger.js";

describe("Request ID Middleware", () => {
  test("generates a UUID when no X-Request-ID header", () => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe("string");
    expect(req.id.length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.id);
  });

  test("uses incoming X-Request-ID when valid", () => {
    const incomingId = "test-request-id-12345";
    const req = { headers: { "x-request-id": incomingId } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe(incomingId);
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", incomingId);
  });

  test("generates new ID when incoming header is too long (potential abuse)", () => {
    const req = { headers: { "x-request-id": "x".repeat(200) } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    // Should NOT use the 200-char string
    expect(req.id.length).toBeLessThan(200);
    expect(next).toHaveBeenCalled();
  });
});

describe("Structured Logger", () => {
  test("logger.child creates contextual logger", () => {
    const child = logger.child({ requestId: "abc-123", route: "/test" });
    expect(typeof child.info).toBe("function");
    expect(typeof child.warn).toBe("function");
    expect(typeof child.error).toBe("function");
    expect(typeof child.debug).toBe("function");
  });

  test("logger methods do not throw", () => {
    expect(() => logger.info("test message")).not.toThrow();
    expect(() => logger.warn("test warning")).not.toThrow();
    expect(() => logger.error("test error")).not.toThrow();
    expect(() => logger.debug("test debug")).not.toThrow();
  });

  test("logger.child methods do not throw", () => {
    const child = logger.child({ requestId: "test" });
    expect(() => child.info("test")).not.toThrow();
    expect(() => child.warn("test")).not.toThrow();
    expect(() => child.error("test")).not.toThrow();
  });
});
