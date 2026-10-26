import type { PrintLayout } from "@/app/utils/printLayout";

/**
 * Shared Admin Products types.
 *
 * These were previously declared inline in Admin/Products/page.tsx. They are
 * now shared by the Products list page, the Add Product page and the
 * ProductForm so all three stay on ONE definition (no drift).
 */
export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  /** getAdminProducts returns a POPULATED category object ({_id,name,slug});
      other endpoints return the plain ObjectId string. */
  category: string | { _id: string; name?: string; slug?: string };
  subcategory?: string | { _id: string; name?: string; slug?: string } | null;
  brand: string;
  colors?: string[];
  sizes?: string[];
  images: Array<{ url: string; public_id: string; alt?: string }>;
  sold?: number;
  averageRating?: number;
  tags?: string[];
  isActive?: boolean;
  addedBy?: string | { _id: string };
  freeShipping?: boolean;
  shippingCharge?: number;
  customizable?: boolean;
  showCustomizationPreview?: boolean;
  customizationFields?: Array<{ fieldType: string; label: string; required: boolean }>;
  printLayout?: PrintLayout | null;
  /** Persistent AI detection status — drives the Products-list badge. */
  printLayoutStatus?: "not_detected" | "detected" | "failed" | string;
  printLayoutError?: string | null;
  /** Variant-wise pricing: { "Color__Size": price, "Size": price } */
  variantPricing?: Record<string, number>;
  /** Variant-wise stock: { "Color__Size": stock, "Size": stock } */
  variantStock?: Record<string, number>;
  /** Background image upload status */
  imageProcessingStatus?: "complete" | "pending" | "processing" | "failed";
  imageProcessingError?: string | null;
}

/** Standard backend success envelope: { status, message, data }. */
export interface ApiEnvelope<T> {
  status?: number;
  message?: string;
  data?: T;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  usesSizeBasedPricing?: boolean;
}

export interface SubcategoryOption {
  _id: string;
  name: string;
  slug?: string;
  parentCategory?: string | { _id?: string } | null;
}

/** Resolve the ObjectId out of a possibly-populated reference field. */
export const referenceId = (
  value: string | { _id?: string } | null | undefined,
): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || "";
};
