import express from "express";
import { addProduct, deleteProduct, getProductById, getProducts, getAdminProducts, rateProduct, updateProduct, searchProducts, getRelatedProducts, searchSuggestions, getProductReviews, deleteRating, checkProductsExist, retryImageUpload } from "../Controllers/productController.js";
import { searchProductsAI } from "../Controllers/aiSearchController.js";
import { analyzePrintLayout } from "../Controllers/printLayoutController.js";
import {
  generateDescription,
  generateProductMetadata,
} from "../Controllers/aiController.js";
import { verifyAdmin, verifyToken, createLimiter } from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";

export let productRouter = express.Router();
productRouter.post(
  "/addProduct",
  verifyToken,
  verifyAdmin,
  upload.array("images", 5),
  addProduct,
);
productRouter.get("/getProduct/:id", getProductById);
productRouter.post("/check-exist", checkProductsExist);
productRouter.get("/getProduct/:id/related", getRelatedProducts);
productRouter.get("/getProduct/:id/reviews", getProductReviews);
productRouter.delete("/getProduct/:id/rating", verifyToken, deleteRating);
productRouter.get("/getAllProducts", createLimiter(60, 1), getProducts);
productRouter.get("/search-suggestions", createLimiter(60, 1), searchSuggestions);
productRouter.get("/search", createLimiter(60, 5), searchProducts);
productRouter.get("/getAdminProducts", verifyToken, verifyAdmin, getAdminProducts);
productRouter.put(
  "/updateProduct/:id",
  verifyToken,
  verifyAdmin,
  upload.array("images", 5),
  updateProduct,
);
productRouter.delete("/deleteProduct/:id", verifyToken, verifyAdmin, deleteProduct);
productRouter.put("/productRatings/:id", verifyToken, rateProduct);

// ==================== AI SEARCH ENDPOINT ====================
productRouter.post("/ai/search-products", createLimiter(20, 10), searchProductsAI);

// ==================== AI DESCRIPTION GENERATION (ADMIN ONLY) ====================
// Server-side Gemini proxy: the API key never leaves the backend. The browser
// only sends the prompt + generation options; this route performs the Gemini
// call and returns the finished text.
productRouter.post(
  "/ai/generate-description",
  verifyToken,
  verifyAdmin,
  createLimiter(60, 60),
  generateDescription,
);

// ==================== AI PRODUCT METADATA FROM IMAGE (ADMIN ONLY) ====================
// Multipart: receives the actual selected image file (memory storage), analyzes
// it with Gemini Vision and returns { name, description }. The image is NEVER
// uploaded to Cloudinary here — it is transient AI-analysis input only. The
// admin reviews/edits the result before the existing addProduct flow runs.
productRouter.post(
  "/ai/generate-product-metadata",
  verifyToken,
  verifyAdmin,
  createLimiter(20, 1),
  upload.single("image"),
  generateProductMetadata,
);

// ==================== AI PRINT LAYOUT DETECTION (ADMIN ONLY) ====================
// Runs Gemini Vision ONCE per product image — never at customer runtime.
// The admin saves the returned layout with the product via updateProduct.
// NOTE: 10/60 was 10 requests per HOUR — tripped instantly by the editor's
// auto-detect-on-open + manual retries, so the whole pipeline 429'd. 30/min
// keeps abuse protection (and Gemini quota in check) without blocking normal
// admin testing; the 24h in-memory layout cache makes repeats free anyway.
productRouter.post(
  "/analyze-print-layout",
  verifyToken,
  verifyAdmin,
  createLimiter(30, 1),
  analyzePrintLayout,
);

// ==================== RETRY FAILED IMAGE UPLOAD ====================
// Re-attempts background image upload for a product whose previous attempt failed.
productRouter.post(
  "/retry-image-upload/:id",
  verifyToken,
  verifyAdmin,
  retryImageUpload,
);
