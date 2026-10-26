import express from "express";
import {
  getBanners,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
} from "../Controllers/homepageBannerController.js";
import { verifyAdmin, verifyToken } from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";

export const homepageBannerRoute = express.Router();

// Public route — no auth required
homepageBannerRoute.get("/", getBanners);

// Admin routes — require authentication + admin role
homepageBannerRoute.get(
  "/admin",
  verifyToken,
  verifyAdmin,
  getAllBannersAdmin,
);

homepageBannerRoute.post(
  "/",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  createBanner,
);

homepageBannerRoute.put(
  "/:id",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  updateBanner,
);

homepageBannerRoute.patch(
  "/reorder",
  verifyToken,
  verifyAdmin,
  reorderBanners,
);

homepageBannerRoute.delete(
  "/:id",
  verifyToken,
  verifyAdmin,
  deleteBanner,
);
