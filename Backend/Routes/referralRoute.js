import express from "express";
import { verifyToken, verifyAdmin } from "../utils/commonFunctions.js";
import {
  getReferralOverview,
  getReferralHistory,
  validateReferralCode,
  claimReferralCode,
  getReferralSettingsAdmin,
  updateReferralSettings,
  getReferralAdminStats,
  searchReferralUsers,
  getReferralUserDetail,
} from "../Controllers/referralController.js";

export const referralRoute = express.Router();

// ── User ──
referralRoute.get("/overview", verifyToken, getReferralOverview);
referralRoute.get("/history", verifyToken, getReferralHistory);
referralRoute.post("/validate", verifyToken, validateReferralCode);
referralRoute.post("/claim", verifyToken, claimReferralCode);

// ── Admin ──
referralRoute.get("/admin/stats", verifyAdmin, getReferralAdminStats);
referralRoute.get("/admin/settings", verifyAdmin, getReferralSettingsAdmin);
referralRoute.put("/admin/settings", verifyAdmin, updateReferralSettings);
referralRoute.get("/admin/search", verifyAdmin, searchReferralUsers);
referralRoute.get("/admin/users/:userId", verifyAdmin, getReferralUserDetail);
