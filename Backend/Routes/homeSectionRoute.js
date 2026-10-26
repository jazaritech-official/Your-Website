import express from "express";
import {
  getSections,
  getAllSectionsAdmin,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
} from "../Controllers/homeSectionController.js";
import { verifyAdmin, verifyToken } from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";

export const homeSectionRoute = express.Router();

// Public route — no auth required
homeSectionRoute.get("/", getSections);

// Admin routes — require authentication + admin role
homeSectionRoute.get(
  "/admin",
  verifyToken,
  verifyAdmin,
  getAllSectionsAdmin,
);

homeSectionRoute.post(
  "/",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  createSection,
);

homeSectionRoute.put(
  "/:id",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  updateSection,
);

homeSectionRoute.patch(
  "/reorder",
  verifyToken,
  verifyAdmin,
  reorderSections,
);

homeSectionRoute.delete(
  "/:id",
  verifyToken,
  verifyAdmin,
  deleteSection,
);