import jwt from "jsonwebtoken";
import { resolveRole } from "./commonFunctions.js";

/**
 * issueAuthToken — SIGN a JWT and SET the cookie in one canonical place.
 *
 * Every auth path (login, Google auth, OTP verification) MUST call this
 * function instead of duplicating jwt.sign() + res.cookie() manually.
 * This guarantees that:
 *   – The JWT payload always includes the correct tokenVersion.
 *   – The JWT expiry (3 days) and the cookie maxAge (3 days) are ALWAYS
 *     the identical duration and can never drift apart.
 *   – The cookie settings are correct for the production cross-site setup
 *     (httpOnly, secure: true, sameSite: "none").
 *
 * @param {import("express").Response} res - Express response object
 * @param {import("mongoose").Document} user - Mongoose User document (fresh from DB)
 * @returns {string} The signed JWT (in case the caller needs it for anything)
 */
export function issueAuthToken(res, user) {
  // ── Build JWT payload ──────────────────────────────────────────────
  const payload = {
    id: user._id,
    isAdmin: user.isAdmin,
    role: resolveRole(user.email, user.role),
    tokenVersion: user.tokenVersion,
  };

  // ── Sign the JWT ───────────────────────────────────────────────────
  const token = jwt.sign(payload, process.env.JWT, { expiresIn: "3d" });

  // ── Set the cookie ─────────────────────────────────────────────────
  // In production (cross-site Vercel domains), sameSite MUST be "none"
  // and secure MUST be true for the cookie to be accepted by the browser.
  // In local development, secure is off and sameSite is lax so the cookie
  // works over plain HTTP on localhost.
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: isProd,        // required for sameSite: "none" in production
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 3 * 24 * 60 * 60 * 1000, // exactly matches JWT expiresIn
  });

  return token;
}

export default issueAuthToken;
