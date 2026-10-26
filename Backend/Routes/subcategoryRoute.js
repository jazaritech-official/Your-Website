import express from "express";
import {
  createSubcategory,
  deleteSubcategory,
  getSubcategories,
  getSubcategoriesByCategory,
  getSubcategoryById,
  updateSubcategory,
} from "../Controllers/subcategoryController.js";
import { verifyAdmin, verifyToken } from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";

export const subcategoryRoute = express.Router();

subcategoryRoute.post(
  "/addSubcategory",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  createSubcategory,
);
subcategoryRoute.get("/getAllSubcategories", getSubcategories);
subcategoryRoute.get(
  "/getSubcategoriesByCategory/:categoryId",
  getSubcategoriesByCategory,
);
subcategoryRoute.get("/getSubcategoryById/:id", getSubcategoryById);
subcategoryRoute.put(
  "/updateSubcategory/:id",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  updateSubcategory,
);
subcategoryRoute.delete(
  "/deleteSubcategory/:id",
  verifyToken,
  verifyAdmin,
  deleteSubcategory,
);
