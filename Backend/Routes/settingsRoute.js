import express from "express";
import { verifyAdmin } from "../utils/commonFunctions.js";
import {
  getPublicSettings,
  getSettingsAdmin,
  updateSettings,
} from "../Controllers/settingsController.js";

export const settingsRoute = express.Router();

// ── Public (storefront: cart / checkout free-shipping progress bar) ──
settingsRoute.get("/", getPublicSettings);

// ── Admin ──
settingsRoute.get("/admin", verifyAdmin, getSettingsAdmin);
settingsRoute.put("/admin", verifyAdmin, updateSettings);
