"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductForm from "../ProductForm";
import { useProductCatalogOptions } from "../useProductCatalogOptions";

/**
 * Dedicated Add Product page — the Add Product form previously hosted in a
 * modal on /Admin/Products now lives at its own route.
 *
 * It reuses the EXACT same ProductForm (fields, validation, payload, image
 * pipeline, variant/size-wise pricing, customization + AI print layout) and
 * the same product creation API — only the presentation container changed.
 *
 * Route: /Admin/Products/AddProduct
 * Authorization: inherited from the shared Admin layout (the same frontend
 * guard the Products page uses) — the backend `verifyToken + verifyAdmin`
 * middleware on POST /product/addProduct remains the actual security boundary.
 */
const AddProductPage = () => {
  const router = useRouter();
  // Same shared catalog loader the Products list uses (no duplicate requests
  // within one admin journey, one source of truth for the category settings).
  const { categories, subcategories, categoriesLoaded } = useProductCatalogOptions();

  return (
    <div className="space-y-6">
      {/* Page context */}
      <div>
        <Link
          href="/Admin/Products"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-[#0856DF]"
        >
          <ChevronLeft size={14} />
          Products
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Add Product
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Create and manage product information
        </p>
      </div>

      {/* Form card — same admin card language as the rest of the panel */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ProductForm
          mode="create"
          categories={categories}
          subcategories={subcategories}
          categoriesLoaded={categoriesLoaded}
          onSaved={() => {
            // The success toast is shown by the form itself (unchanged). The
            // product list refetches on mount, so the new product appears at
            // the top exactly like before (it was appended to local state).
            router.push("/Admin/Products");
          }}
          onCancel={() => router.push("/Admin/Products")}
        />
      </div>
    </div>
  );
};

export default AddProductPage;
