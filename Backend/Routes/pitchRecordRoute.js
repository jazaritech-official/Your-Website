import express from "express";
import { requireSuperAdmin, createLimiter, userOrIpKey } from "../utils/commonFunctions.js";
import {
  listPitchRecords,
  getPitchRecord,
  createPitchRecord,
  updatePitchRecord,
  deletePitchRecord,
} from "../Controllers/pitchRecordController.js";

export const pitchRecordRoute = express.Router();

/* ── SUPERADMIN-only: internal Jazari Tech sales/pitch records ──
   No public route exists — internalNotes stay private by construction.
   Tier enforced by requireSuperAdmin (F-14), mirroring the Studio routes
   and the frontend SUPERADMIN_ONLY_ROUTES guard. */

// Moderate rate budget for these admin endpoints (F-12) — keyed by the
// authenticated superadmin id when available, client IP otherwise.
const pitchLimiter = createLimiter(30, 1, { keyGenerator: userOrIpKey });

pitchRecordRoute.get("/admin", requireSuperAdmin, pitchLimiter, listPitchRecords);
pitchRecordRoute.post("/admin", requireSuperAdmin, pitchLimiter, createPitchRecord);
pitchRecordRoute.get("/admin/:id", requireSuperAdmin, pitchLimiter, getPitchRecord);
pitchRecordRoute.put("/admin/:id", requireSuperAdmin, pitchLimiter, updatePitchRecord);
pitchRecordRoute.delete("/admin/:id", requireSuperAdmin, pitchLimiter, deletePitchRecord);
