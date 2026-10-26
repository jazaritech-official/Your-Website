import express from "express";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
} from "../Controllers/categoryController.js";
import { verifyAdmin, verifyToken } from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";

export const categoryRoute = express.Router();

categoryRoute.post(
  "/addCategory",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  createCategory,
);
categoryRoute.get("/getCategoryBySlug/:slug", getCategoryBySlug);
categoryRoute.get("/getCategoryById/:id", getCategoryById);
categoryRoute.get("/getAllCategories", getCategories);
categoryRoute.put(
  "/updateCategory/:id",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  updateCategory,
);
categoryRoute.delete("/deleteCategory/:id", verifyToken, verifyAdmin, deleteCategory);
