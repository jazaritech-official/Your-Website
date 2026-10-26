import express from "express";
import {
  requireSuperAdmin,
  verifyShowcaseRevalidateTicket,
  createLimiter,
  userOrIpKey,
} from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";
import {
  // Public
  getPublicShowcase,
  listPublicShowcases,
  authorizeShowcaseRevalidate,
  // Admin
  listShowcases,
  getShowcase,
  getPreviewConfig,
  createShowcase,
  updateShowcase,
  uploadShowcaseAsset,
  publishShowcase,
  archiveShowcase,
  unarchiveShowcase,
  duplicateShowcase,
  restoreVersion,
  aiSuggestBrandDirection,
} from "../Controllers/brandProfileController.js";

export const brandProfileRoute = express.Router();

/* ── Public (storefront showcase routes; published config only) ── */
brandProfileRoute.get("/public", listPublicShowcases);
brandProfileRoute.get("/public/:slug", getPublicShowcase);

/* Revalidation-ticket exchange for the frontend's /api/showcase/revalidate
   route (F-07). Server-to-server, ticket-authed with a derived key — NOT an
   auth bypass: the ticket is minted by a showcase write, scoped to
   "showcase:revalidate", and expires in 5 minutes. */
brandProfileRoute.post(
  "/revalidate/authorize",
  verifyShowcaseRevalidateTicket,
  authorizeShowcaseRevalidate,
);

/* ── Admin: Studio management — SUPERADMIN tier only (F-14) ──────
   Showcase Studio is Jazari Tech internal sales tooling; the backend gate
   (requireSuperAdmin) matches the frontend SUPERADMIN_ONLY_ROUTES guard so
   code and comments agree. Auth always runs before multer below. */
brandProfileRoute.get("/admin", requireSuperAdmin, listShowcases);
brandProfileRoute.post("/admin", requireSuperAdmin, adminWriteLimiter, createShowcase);

/* ── Rate limiting (F-12) ──────────────────────────────────────
   New/expensive routes only — existing limiters elsewhere are untouched.
   Keyed by the authenticated superadmin id (auth runs first), falling back
   to client IP. */

// Strict — every call can consume Gemini quota (10/min per user).
const aiSuggestLimiter = createLimiter(10, 1, { keyGenerator: userOrIpKey });
// Asset uploads are heavier than normal writes (30/min per user).
const assetUploadLimiter = createLimiter(30, 1, { keyGenerator: userOrIpKey });
// Moderate budget for the remaining admin writes (30/min per user).
const adminWriteLimiter = createLimiter(30, 1, { keyGenerator: userOrIpKey });

/* AI-assisted brand direction — admin-only, editable suggestion, never
   auto-applied. Returns code AI_NOT_CONFIGURED when GEMINI_API_KEY is
   absent so the Studio can show an honest "unavailable" state. */
brandProfileRoute.post(
  "/admin/ai/suggest",
  requireSuperAdmin,
  aiSuggestLimiter,
  aiSuggestBrandDirection,
);

brandProfileRoute.get("/admin/:id", requireSuperAdmin, getShowcase);
brandProfileRoute.put("/admin/:id", requireSuperAdmin, adminWriteLimiter, updateShowcase);
// Auth always runs BEFORE multer here — the limiter can't be used to make
// an unauthenticated upload attempt parse a body.
brandProfileRoute.post(
  "/admin/:id/asset",
  requireSuperAdmin,
  assetUploadLimiter,
  upload.single("image"),
  uploadShowcaseAsset,
);
brandProfileRoute.post("/admin/:id/publish", requireSuperAdmin, adminWriteLimiter, publishShowcase);
brandProfileRoute.post("/admin/:id/archive", requireSuperAdmin, adminWriteLimiter, archiveShowcase);
brandProfileRoute.post("/admin/:id/unarchive", requireSuperAdmin, adminWriteLimiter, unarchiveShowcase);
brandProfileRoute.post("/admin/:id/duplicate", requireSuperAdmin, adminWriteLimiter, duplicateShowcase);
brandProfileRoute.post(
  "/admin/:id/versions/:version/restore",
  requireSuperAdmin,
  adminWriteLimiter,
  restoreVersion,
);

/* Authenticated preview of a DRAFT configuration (never served publicly). */
brandProfileRoute.get("/admin/:id/preview-config", requireSuperAdmin, getPreviewConfig);
