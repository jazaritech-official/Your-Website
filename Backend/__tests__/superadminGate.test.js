/**
 * Superadmin role-gate tests (F-14).
 *
 * Showcase Studio and Pitch Records are Jazari Tech internal sales tooling.
 * Their backend routes are guarded by `requireSuperAdmin`, whose decision
 * function (`isSuperAdmin`) is extracted here as a pure unit so the gate is
 * tested directly, plus middleware-level checks for the paths that do NOT
 * need a database:
 *
 *   • no token       → 401 (verifyToken short-circuits before any DB call)
 *   • garbage token  → 403 (signature rejected)
 *   • valid token but no user document → role falls back to "user" → 403
 *
 * The POSITIVE superadmin path resolves the role from the database inside
 * verifyToken and is covered by the Phase 6 integration suite (in-memory
 * MongoDB), which seeds a superadmin user.
 *
 * `process.env.JWT` is set BEFORE importing the module (signing key).
 */
import { describe, test, expect, beforeAll } from "@jest/globals";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

let isSuperAdmin;
let requireSuperAdmin;

const TEST_JWT_SECRET = "test-jwt-secret";

beforeAll(async () => {
  if (!process.env.JWT) process.env.JWT = TEST_JWT_SECRET;
  // No database in this suite: make model queries fail immediately instead
  // of buffering, so verifyToken falls back to role "user" (its documented
  // failure path) rather than hanging for the 10s buffer timeout.
  mongoose.set("bufferCommands", false);
  const mod = await import("../utils/commonFunctions.js");
  isSuperAdmin = mod.isSuperAdmin;
  requireSuperAdmin = mod.requireSuperAdmin;
});

const runGate = (req) =>
  new Promise((resolve) => {
    requireSuperAdmin(req, {}, (err) => resolve(err));
  });

describe("isSuperAdmin — role gate decision (F-14)", () => {
  test("only the superadmin role passes", () => {
    expect(isSuperAdmin({ role: "superadmin" })).toBe(true);
  });

  test("admin / rider / user / missing roles are all rejected", () => {
    expect(isSuperAdmin({ role: "admin" })).toBe(false);
    expect(isSuperAdmin({ role: "rider" })).toBe(false);
    expect(isSuperAdmin({ role: "user" })).toBe(false);
    expect(isSuperAdmin({})).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });

  test("a legacy isAdmin flag alone does NOT elevate to the superadmin tier", () => {
    // The tier is defined by the resolved `role` string only — no side doors.
    expect(isSuperAdmin({ role: "admin", isAdmin: true })).toBe(false);
    expect(isSuperAdmin({ isAdmin: true })).toBe(false);
  });

  test("case-sensitive: 'Superadmin' / ' SUPERADMIN' do not pass", () => {
    expect(isSuperAdmin({ role: "Superadmin" })).toBe(false);
    expect(isSuperAdmin({ role: " SUPERADMIN" })).toBe(false);
  });
});

describe("requireSuperAdmin — middleware failure paths", () => {
  test("no credentials → 401 before any role logic", async () => {
    const err = await runGate({ headers: {} });
    expect(err?.status).toBe(401);
  });

  test("a garbage bearer token → 403 (signature rejected)", async () => {
    const err = await runGate({
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(err?.status).toBe(403);
  });

  test("a valid token whose user no longer exists falls back to 'user' → 403", async () => {
    // verifyToken's documented failure path: DB unavailable / user gone ⇒
    // role "user" ⇒ the gate denies. Fails closed, never open.
    const token = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString(), role: "superadmin" },
      TEST_JWT_SECRET,
    );
    const err = await runGate({
      headers: { authorization: `Bearer ${token}` },
    });
    expect(err?.status).toBe(403);
    expect(err?.message).toMatch(/super admin/i);
  });
});
