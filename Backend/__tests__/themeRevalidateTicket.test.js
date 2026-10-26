/**
 * Theme revalidation ticket tests.
 *
 * These guard the cross-service trust boundary introduced for on-demand theme
 * revalidation: a successful theme write mints a short-lived ticket that the
 * frontend's /api/theme/revalidate route exchanges for permission to purge its
 * ISR cache (the admin session cookie is host-only to the backend origin, so it
 * never reaches the frontend route).
 *
 * The security property that matters is that the ticket is scoped and signed
 * with a DERIVED key, so it can NEVER be replayed as a normal access token.
 *
 * `process.env.JWT` is set BEFORE importing the module because the derived
 * signing key is computed at module load.
 */
import { describe, test, expect, beforeAll } from "@jest/globals";
import jwt from "jsonwebtoken";

let signThemeRevalidateTicket;
let verifyThemeRevalidateTicket;

const TEST_JWT_SECRET = "test-jwt-secret";

beforeAll(async () => {
  if (!process.env.JWT) process.env.JWT = TEST_JWT_SECRET;
  const mod = await import("../utils/commonFunctions.js");
  signThemeRevalidateTicket = mod.signThemeRevalidateTicket;
  verifyThemeRevalidateTicket = mod.verifyThemeRevalidateTicket;
});

/** Run the middleware with a bearer header and resolve { err, req }. */
const runVerifier = (authorization) =>
  new Promise((resolve) => {
    const req = { headers: authorization ? { authorization } : {} };
    verifyThemeRevalidateTicket(req, {}, (err) => resolve({ err, req }));
  });

describe("Theme revalidation ticket", () => {
  test("a minted ticket is accepted and carries the revalidate scope", async () => {
    const ticket = signThemeRevalidateTicket({
      id: "admin-1",
      role: "admin",
      tokenVersion: 0,
    });
    const { err, req } = await runVerifier(`Bearer ${ticket}`);
    expect(err).toBeUndefined();
    expect(req.revalidateTicket?.scope).toBe("theme:revalidate");
  });

  test("a missing ticket is rejected with 401", async () => {
    const { err } = await runVerifier("");
    expect(err?.status).toBe(401);
  });

  test("a malformed ticket is rejected with 403", async () => {
    const { err } = await runVerifier("Bearer not-a-real-token");
    expect(err?.status).toBe(403);
  });

  test("a ticket signed with the bare JWT secret is NOT accepted", async () => {
    // This is the escalation this design prevents: a plain access-style token
    // must not authorize revalidation, and vice-versa.
    const forged = jwt.sign({ id: "admin-1", role: "admin" }, TEST_JWT_SECRET);
    const { err } = await runVerifier(`Bearer ${forged}`);
    expect(err?.status).toBe(403);
  });

  test("a ticket signed with the derived secret but no scope is rejected", async () => {
    const unscoped = jwt.sign(
      { id: "admin-1" },
      `${TEST_JWT_SECRET}:theme-revalidate`,
    );
    const { err } = await runVerifier(`Bearer ${unscoped}`);
    expect(err?.status).toBe(403);
  });
});
