import express from "express";
import { verifyToken, verifyAdmin } from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";
import {
  applyForRider,
  getMyApplication,
  listRiderApplications,
  approveRiderApplication,
  rejectRiderApplication,
} from "../Controllers/riderController.js";

export const riderRoute = express.Router();

// ── Customer self-service ──
// Apply to become a rider (authenticated, any role)
riderRoute.post(
  "/apply",
  verifyToken,
  upload.fields([
    { name: "idDocument", maxCount: 1 },
    { name: "licenseDocument", maxCount: 1 },
  ]),
  applyForRider
);

// Check own application status (authenticated)
riderRoute.get("/application", verifyToken, getMyApplication);

// ── Admin management ──
// List all rider applications (admin only)
riderRoute.get("/applications", verifyAdmin, listRiderApplications);

// Approve a rider application (admin only)
riderRoute.patch("/applications/:userId/approve", verifyAdmin, approveRiderApplication);

// Reject a rider application (admin only)
riderRoute.patch("/applications/:userId/reject", verifyAdmin, rejectRiderApplication);
