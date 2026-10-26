/**
 * Showcase revalidation ticket tests (F-07).
 *
 * Guards the server-to-server trust boundary introduced for on-demand
 * showcase purging: after publish/archive/unarchive the BACKEND calls the
 * frontend's /api/showcase/revalidate route with this short-lived ticket,
 * and the route (which holds no signing key) exchanges it at
 * POST /brand-profiles/revalidate/authorize.
 *
 * Properties under test: scoped "showcase:revalidate", signed with a
 * DERIVED key, and NEVER interchangeable with a theme ticket or a normal
 * access token.
 *
 * `process.env.JWT` is set BEFORE importing the module because the derived
 * signing key is computed at module load.
 */
import { describe, test, expect, beforeAll } from "@jest/globals";
import jwt from "jsonwebtoken";

let signShowcaseRevalidateTicket;
let verifyShowcaseRevalidateTicket;

const TEST_JWT_SECRET = "test-jwt-secret";

beforeAll(async () => {
  if (!process.env.JWT) process.env.JWT = TEST_JWT_SECRET;
  const mod = await import("../utils/commonFunctions.js");
  signShowcaseRevalidateTicket = mod.signShowcaseRevalidateTicket;
  verifyShowcaseRevalidateTicket = mod.verifyShowcaseRevalidateTicket;
});

/** Run the middleware with a bearer header and resolve { err, req }. */
const runVerifier = (authorization) =>
  new Promise((resolve) => {
    const req = { headers: authorization ? { authorization } : {} };
    verifyShowcaseRevalidateTicket(req, {}, (err) => resolve({ err, req }));
  });

describe("Showcase revalidation ticket (F-07)", () => {
  test("a minted ticket is accepted and carries the showcase scope", async () => {
    const ticket = signShowcaseRevalidateTicket({
      id: "admin-1",
      role: "superadmin",
    });
    const { err, req } = await runVerifier(`Bearer ${ticket}`);
    expect(err).toBeUndefined();
    expect(req.revalidateTicket?.scope).toBe("showcase:revalidate");
  });

  test("a missing ticket is rejected with 401", async () => {
    const { err } = await runVerifier("");
    expect(err?.status).toBe(401);
  });

  test("a malformed ticket is rejected with 403", async () => {
    const { err } = await runVerifier("Bearer not-a-real-token");
    expect(err?.status).toBe(403);
  });

  test("a THEME-scoped ticket is NOT accepted (cross-scope replay blocked)", async () => {
    const themeKey = `${TEST_JWT_SECRET}:theme-revalidate`;
    const forged = jwt.sign(
      { scope: "theme:revalidate", id: "admin-1" },
      themeKey,
    );
    const { err } = await runVerifier(`Bearer ${forged}`);
    expect(err?.status).toBe(403);
  });

  test("a ticket signed with the bare JWT secret is NOT accepted", async () => {
    // The escalation this design prevents: a normal access token must never
    // authorize a cache purge.
    const forged = jwt.sign({ id: "admin-1", role: "admin" }, TEST_JWT_SECRET);
    const { err } = await runVerifier(`Bearer ${forged}`);
    expect(err?.status).toBe(403);
  });

  test("a correctly-keyed ticket with no scope is rejected", async () => {
    const unscoped = jwt.sign(
      { id: "admin-1" },
      `${TEST_JWT_SECRET}:showcase-revalidate`,
    );
    const { err } = await runVerifier(`Bearer ${unscoped}`);
    expect(err?.status).toBe(403);
  });
});
