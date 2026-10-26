"use client";
import { formatPKR } from "@/app/utils/format";

import {
  AlertCircle,
  DockIcon,
  Edit,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getCachedPrintLayout,
  isPrintLayoutStale,
  setCachedPrintLayout,
  type PrintLayout,
} from "@/app/utils/printLayout";
import useFetch, {
  baseUrl,
  showToast,
  cloudinaryUrl,
  getSizePriceRange,
} from "@/app/utils/commonFunctions";
import axios from "axios";
import { formatProductForSocialShare } from "@/app/utils/formatProductForSocialShare";
import ProductForm, { interpretAnalyzeResponse } from "./ProductForm";
import { referenceId, type ApiEnvelope, type Product } from "./productTypes";
import { useProductCatalogOptions } from "./useProductCatalogOptions";

/** Server-driven pagination metadata returned by getAdminProducts (F-13). */
type AdminPagination = {
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

type ProductsBody =
  | Product[]
  | { products?: Product[]; pagination?: AdminPagination };

/** Page size for the Admin catalogue — the backend paginates (F-13). */
const ADMIN_PAGE_SIZE = 25;

/**
 * Price shown for one row of the Admin Products table.
 *
 * Size-wise products keep their authoritative prices in `variantPricing` and
 * deliberately store a flat `price` of 0 — the backend enforces that invariant
 * (updateProduct clears the flat price whenever variantPricing is non-empty).
 * Reading `product.price` alone therefore rendered "Rs 0" for every size-wise
 * product in the Admin list, even though the storefront showed the real price.
 *
 * This reuses the SAME storefront resolution helper + convention as
 * ProductCard / productsPage:
 *   - differing size prices → "From Rs <min>" (full range on hover)
 *   - one uniform size price → "Rs <price>"
 *   - flat-priced product     → "Rs <product.price>" (unchanged)
 *
 * PRESENTATION ONLY — nothing here mutates the product or its pricing map.
 */
const resolveAdminDisplayPrice = (
  product: Product,
): { text: string; title: string; perSize: boolean } => {
  const { minPrice, maxPrice, hasRange } = getSizePriceRange(
    product.variantPricing,
  );
  if (hasRange) {
    return {
      text: `From ${formatPKR(minPrice)}`,
      title: `Size-wise pricing: ${formatPKR(minPrice)} – ${formatPKR(maxPrice)}`,
      perSize: true,
    };
  }
  if (minPrice > 0) {
    return {
      text: `${formatPKR(minPrice)}`,
      title: "Size-wise pricing: same price for every size",
      perSize: true,
    };
  }
  return { text: `Rs ${product.price ?? 0}`, title: "", perSize: false };
};

const ProductsPage = () => {
  // ── Server-driven list state (F-13) ──
  // search/category/subcategory filtering and pagination happen in the
  // backend so the "Showing X–Y of Z" totals are computed from the SAME
  // filter that returned the rows. The old `?limit=500` + client-filter
  // approach silently truncated at 100 products.
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  // Search runs off the deferred term: typing stays responsive and the
  // server sees one request per idle pass instead of one per keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("all");

  const adminListQuery = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(ADMIN_PAGE_SIZE),
    });
    const q = deferredSearchTerm.trim();
    if (q) params.set("search", q);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (subcategoryFilter !== "all") params.set("subcategory", subcategoryFilter);
    return params.toString();
  }, [page, deferredSearchTerm, categoryFilter, subcategoryFilter]);
  const { data: productsRes, loading: productsLoading } = useFetch<ApiEnvelope<ProductsBody>>(
    `${baseUrl}product/getAdminProducts?${adminListQuery}`,
  );
  // Categories + subcategories come from the shared catalog loader, so the
  // Products list and the dedicated Add Product page never re-implement the
  // same requests/normalisation (and never fetch them twice in one journey).
  const { categories, subcategories, categoriesLoaded } = useProductCatalogOptions();

  const [products, setProducts] = useState<Product[]>([]);
  /** Product currently open in the Edit modal (null = closed). */
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("superadmin");
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);
  // Row-level AI print-layout detection (works without the modal)
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [detectElapsed, setDetectElapsed] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("user");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setCurrentUserId(parsed?._id ?? null);
          setUserRole(parsed?.role ?? (parsed?.isAdmin ? "superadmin" : "user"));
        } catch (err) { console.error("[silent-catch page.tsx]", err); }
      }
    }
  }, []);

  // Elapsed seconds for the in-flight row detection (Cancel (Xs) affordance).
  useEffect(() => {
    if (!detectingId) { setDetectElapsed(0); return; }
    setDetectElapsed(0);
    const interval = setInterval(() => setDetectElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [detectingId]);

  /* ── List-level Detect / Re-detect / Retry (Admin → Products, no modal) ── */
  const saveLayoutToProduct = async (
    product: Product,
    layout: PrintLayout | null,
    error: string | null,
  ) => {
    // Success: store the detected layout + status=detected. Failure: KEEP the
    // last good layout (customer preview must never break) and record the
    // failure + safe error so the list shows ✕ Failed with a Retry button.
    const payload: Record<string, unknown> = layout
      ? {
        printLayout: JSON.stringify(layout),
        printLayoutStatus: "detected",
        printLayoutError: null,
      }
      : {
        printLayoutStatus: "failed",
        printLayoutError: error,
      };
    try {
      const res = await axios.put(
        `${baseUrl}product/updateProduct/${product._id}`,
        payload,
        { withCredentials: true },
      );
      const updated = res.data?.data;
      if (updated) {
        setProducts((prev) =>
          prev.map((p) => (p._id === product._id ? updated : p)),
        );
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            p._id === product._id
              ? {
                ...p,
                printLayout: layout ?? p.printLayout,
                printLayoutStatus: layout ? "detected" : "failed",
                printLayoutError: layout ? null : error,
              }
              : p,
          ),
        );
      }
      if (layout) {
        showToast("Print layout detected & saved", "success");
      } else {
        showToast(error || "Print layout detection failed", "error");
      }
    } catch (saveErr) {
      const failData = (saveErr as { response?: { data?: unknown } })?.response
        ?.data;
      console.error(
        "[PrintLayout] failed to persist detection result:",
        failData ?? saveErr,
      );
      // Keep the list honest even if persistence hiccuped.
      setProducts((prev) =>
        prev.map((p) =>
          p._id === product._id
            ? {
              ...p,
              printLayout: layout ?? p.printLayout,
              printLayoutStatus: layout ? "detected" : "failed",
              printLayoutError: layout ? null : error,
            }
            : p,
        ),
      );
      showToast(
        layout ? "Layout detected but could not be saved" : "Detection failed",
        layout ? "warn" : "error",
      );
    }
  };

  const handleDetectLayoutForProduct = async (product: Product) => {
    const imageUrl = product.images?.[0]?.url || "";
    if (!imageUrl) {
      showToast("Product has no image to analyze", "warn");
      return;
    }
    // A fresh layout already stored for THIS image — nothing to do (the badge
    // already shows ✓ Detected). Never burn a Gemini call on a re-render.
    if (
      product.printLayout &&
      product.printLayout.customizable === true &&
      !isPrintLayoutStale(product.printLayout, imageUrl)
    ) {
      showToast("A fresh print layout is already stored for this image", "info");
      return;
    }
    // Offline mirror first — a previously detected layout for this exact image
    // is re-used with ZERO Gemini calls (matches the backend 24h cache).
    const cached = getCachedPrintLayout(imageUrl);
    if (cached) {
      setCachedPrintLayout(imageUrl, cached);
      await saveLayoutToProduct(product, cached, null);
      return;
    }
    setDetectingId(product._id);
    try {
      const res = await axios.post(
        `${baseUrl}product/analyze-print-layout`,
        { imageUrl },
        { withCredentials: true },
      );
      // Same contract as the form's detection — 200 + data.customizable = SUCCESS.
      const { layout, reason } = interpretAnalyzeResponse(res.data);
      if (layout) {
        console.log("[PrintLayout] final: SUCCESS");
        setCachedPrintLayout(imageUrl, layout);
        await saveLayoutToProduct(product, layout, null);
      } else {
        // Structured backend failure — errorCode/stage identify the exact
        // stage (gemini/parse/fetch/...) without leaking any secrets. Log the
        // full body so the console preserves the stage/code.
        console.error("[PrintLayout] final: FAILURE —", reason, res.data);
        await saveLayoutToProduct(
          product,
          null,
          reason || "Could not detect a print layout",
        );
      }
    } catch (err) {
      const failData = (err as { response?: { data?: { message?: string } } })
        ?.response?.data;
      console.error(
        "[PrintLayout] detection failed — backend stage:",
        failData ?? err,
      );
      const message =
        (failData as { message?: string } | undefined)?.message ||
        "AI analysis failed. Please try again.";
      await saveLayoutToProduct(product, null, message);
    } finally {
      setDetectingId(null);
    }
  };

  /** Badge state for the Products list — derived purely from stored data.
   *  ✓ Detected = fresh layout for the current image · ⚠ Not Detected = never
   *  analyzed / image changed since detection · ✕ Failed = last analysis
   *  errored (old layout kept, customer preview unaffected). */
  const getLayoutBadge = (product: Product) => {
    const imageUrl = product.images?.[0]?.url || "";
    const pl = product.printLayout ?? null;
    if (!product.customizable) return { kind: "na" as const };
    if (product.printLayoutStatus === "failed") {
      return { kind: "failed" as const, error: product.printLayoutError || "" };
    }
    if (pl && pl.customizable === true && !isPrintLayoutStale(pl, imageUrl)) {
      return { kind: "detected" as const };
    }
    return { kind: "none" as const };
  };

  // Load products — defensive dedup by _id (safety net against any API-level duplication)
  useEffect(() => {
    const body = productsRes?.data;
    if (body) {

      // Handle different API response structures
      let productsArray: Product[] = [];

      if (Array.isArray(body)) {
        productsArray = body;
      } else if (Array.isArray(body.products)) {
        productsArray = body.products;
      }

      // Deduplicate by _id — if the API ever returns the same product twice,
      // only keep the first occurrence (defensive safety net).
      const seenIds = new Set<string>();
      const deduped = (Array.isArray(productsArray) ? productsArray : []).filter((p) => {
        if (!p?._id || seenIds.has(p._id)) return false;
        seenIds.add(p._id);
        return true;
      });

      setProducts(deduped);
    }
  }, [productsRes?.data]);

  /** O(1) category lookup for the table (was an array scan per row per render). */
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c._id, c.name));
    return map;
  }, [categories]);

  const subcategoryById = useMemo(() => {
    const map = new Map<string, string>();
    subcategories.forEach((s) => map.set(s._id, s.name));
    return map;
  }, [subcategories]);

  /** Subcategories of the currently selected category filter. */
  const subcategoryFilterOptions = useMemo(
    () =>
      subcategories.filter(
        (s) => referenceId(s.parentCategory) === categoryFilter,
      ),
    [subcategories, categoryFilter],
  );

  /**
   * Server pagination metadata (F-13) — derived straight from the fetch
   * response during render (never mirrored into state), so the displayed
   * totals can never drift from the rows actually shown.
   */
  const adminBody = Array.isArray(productsRes?.data) ? null : productsRes?.data;
  const pagination = adminBody?.pagination;
  const totalProducts = pagination?.totalProducts ?? products.length;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const rangeStart = totalProducts === 0 ? 0 : (page - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd =
    totalProducts === 0 ? 0 : (page - 1) * ADMIN_PAGE_SIZE + products.length;

  // F-13: the server has already applied search + category + subcategory
  // filtering to exactly this page — `products` IS the filtered result.
  // (The old client-side filter also matched on name only, while the server
  // matches name/description/tags, so re-filtering here would hide rows.)
  const filteredProducts = products;

  /** Copy the social-share blurb for one product (row action, unchanged). */
  const handleCopyShareText = useCallback(async (product: Product) => {
    const message = formatProductForSocialShare(product);
    const markCopied = () => {
      setCopiedProductId(product._id);
      showToast("Product details copied — ready to paste on WhatsApp, Facebook, or Instagram!", "success");
      setTimeout(() => setCopiedProductId(null), 2000);
    };
    try {
      await navigator.clipboard.writeText(message);
      markCopied();
    } catch {
      // Fallback for older browsers or insecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = message;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        markCopied();
      } catch {
        showToast("Could not copy — please try selecting and copying manually", "error");
      }
      document.body.removeChild(textarea);
    }
  }, []);

  const handleEditProduct = useCallback((product: Product) => {
    // Mounting the form with the product (keyed by _id) replaces the old
    // imperative handleEditProduct state push — same initial values.
    setEditingProduct(product);
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);

    try {
      const response = await axios.delete(
        `${baseUrl}product/deleteProduct/${deleteId}`,
        { withCredentials: true },
      );

      if (response.data) {
        const remaining = products.filter((prod) => prod._id !== deleteId).length;
        setProducts((prev) => prev.filter((prod) => prod._id !== deleteId));
        // If the last row of this page was deleted, step back one page so
        // the operator never lands on an empty page (F-13).
        if (remaining === 0 && page > 1) setPage(page - 1);
        showToast("Product deleted successfully", "success");
      }

      setDeleteId(null);
    } catch (error) {
      const errorMessage =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Failed to delete product";
      showToast(errorMessage, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Product Catalog
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage your product inventory
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">
            <DockIcon className="h-4 w-4 text-[#0856DF]" /> Total: {totalProducts}
          </span>
          {/* Navigates to the dedicated Add Product page (no modal). */}
          <Link
            href="/Admin/Products/AddProduct"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
          >
            <Plus className="h-4 w-4" /> New Product
          </Link>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1); // filters/search always restart at page 1 (F-13)
            }}
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category:</span>
          <div className="flex flex-wrap gap-1.5">
            {[{ _id: "all", name: "All" }, ...categories].map((cat) => (
              <button
                key={cat._id}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat._id);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  categoryFilter === cat._id
                    ? "bg-[#0856DF] text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-[#0856DF]/40 hover:text-[#0856DF]"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          {categoryFilter !== "all" && (
            <button
              onClick={() => {
                setCategoryFilter("all");
                setSubcategoryFilter("all");
                setPage(1);
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition"
            >
              ✕ Clear
            </button>
          )}
        </div>
        {/* Subcategory filter — shown only when a specific category is selected */}
        {categoryFilter !== "all" && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subcategory:</span>
            <div className="flex flex-wrap gap-1.5">
              {[{ _id: "all", name: "All" }, ...subcategoryFilterOptions].map((sub) => (
                <button
                  key={sub._id}
                  type="button"
                  onClick={() => {
                    setSubcategoryFilter(sub._id);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    subcategoryFilter === sub._id
                      ? "bg-[#C8A84E] text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200 hover:border-[#C8A84E]/40 hover:text-[#C8A84E]"
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
            {subcategoryFilter !== "all" && (
              <button
                onClick={() => {
                  setSubcategoryFilter("all");
                  setPage(1);
                }}
                className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition"
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-left">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[17%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="p-4">Product Name</th>
              <th className="p-4">Category</th>
              <th className="p-4 text-center">Price</th>
              <th className="p-4 text-center">Stock</th>
              <th className="p-4 text-center">Shipping</th>
              <th className="p-4 text-center">Rating</th>
              <th className="p-4 text-center">AI Print Preview</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {productsLoading ? (
              <tr>
                <td colSpan={8} className="p-10 text-center">
                  <p className="text-sm font-medium text-slate-500">Loading products...</p>
                </td>
              </tr>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <tr key={product._id} className="transition-colors hover:bg-slate-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {product.imageProcessingStatus === "pending" || product.imageProcessingStatus === "processing" ? (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200 bg-amber-50">
                          <Loader2 size={18} className="animate-spin text-amber-500" />
                        </div>
                      ) : product.images?.[0] ? (
                        <img
                          src={cloudinaryUrl(product.images[0].url, 100)}
                          alt={product.name}
                          width={44}
                          height={44}
                          loading="lazy"
                          decoding="async"
                          className="h-11 w-11 rounded-lg border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-100">
                          <Upload size={18} className="text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {product.description}
                        </p>
                        {product.imageProcessingStatus === "pending" && (
                          <p className="text-[10px] font-medium text-amber-600">Uploading images...</p>
                        )}
                        {product.imageProcessingStatus === "processing" && (
                          <p className="text-[10px] font-medium text-blue-600">Processing images...</p>
                        )}
                        {product.imageProcessingStatus === "failed" && (
                          <p className="text-[10px] font-medium text-red-600">Image upload failed</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-700">
                        {categoryNameById.get(referenceId(product.category)) ||
                          "Uncategorized"}
                      </span>
                      {(() => {
                        const subName = subcategoryById.get(
                          referenceId(product.subcategory),
                        );
                        if (!subName) return null;
                        return (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#0856DF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0856DF]">
                            {subName}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {(() => {
                      const { text, title, perSize } = resolveAdminDisplayPrice(product);
                      return (
                        <>
                          <p
                            className="font-semibold text-slate-900"
                            title={title || undefined}
                          >
                            {text}
                          </p>
                          {perSize && (
                            <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                              per size
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${product.stock > 20
                          ? "bg-emerald-50 text-emerald-700"
                          : product.stock > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                        }`}
                    >
                      {product.stock}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    {product.freeShipping ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Free
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-slate-700">
                        Rs {product.shippingCharge ?? 0}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <p className="font-semibold text-slate-900">
                      {product.averageRating
                        ? product.averageRating.toFixed(1)
                        : "—"}
                    </p>
                  </td>
                  <td className="p-4 text-center align-middle">
                    {(() => {
                      const badge = getLayoutBadge(product);
                      if (badge.kind === "na") {
                        return (
                          <span
                            title="Not a customizable product — no print layout needed"
                            className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-200"
                          >
                            —
                          </span>
                        );
                      }
                      const isDetecting = detectingId === product._id;
                      const actionLabel =
                        badge.kind === "detected"
                          ? "Re-detect"
                          : badge.kind === "failed"
                            ? "Retry"
                            : "Detect Layout";
                      return (
                        <div className="flex flex-col items-center gap-1.5">
                          {badge.kind === "detected" ? (
                            <span
                              title="Stored layout is fresh for this product image — customers render from it with zero AI"
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"
                            >
                              Detected
                            </span>
                          ) : badge.kind === "failed" ? (
                            <span
                              title={badge.error || "Last analysis failed — retry from the list"}
                              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 ring-1 ring-red-200"
                            >
                              Failed
                            </span>
                          ) : (
                            <span
                              title={
                                product.printLayout
                                  ? "Analysis found no printable surface — re-detect after changing the product image"
                                  : "No layout detected yet — click Detect Layout"
                              }
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200"
                            >
                              Not Detected
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (isDetecting) {
                                // Pre-existing behavior: row detection has no
                                // AbortController, so this click is a no-op and
                                // the row clears itself when the request settles.
                                return;
                              }
                              handleDetectLayoutForProduct(product);
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${isDetecting
                                ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"
                                : badge.kind === "failed"
                                  ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"
                                  : "border border-blue-200 bg-blue-50 text-[#0856DF] hover:bg-[#0856DF] hover:text-white"
                              }`}
                          >
                            {isDetecting ? (
                              <>
                                <Loader2 size={10} className="animate-spin" />
                                Cancel ({detectElapsed}s)
                              </>
                            ) : badge.kind === "failed" ? (
                              "Retry"
                            ) : (
                              actionLabel
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-4">                      <div className="flex flex-wrap justify-center gap-2">
                    {/* WhatsApp Copy Button */}
                    <button
                      onClick={() => handleCopyShareText(product)}
                      className={`rounded-lg border p-2 transition ${copiedProductId === product._id
                          ? "border-emerald-300 bg-emerald-500 text-white"
                          : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                        }`}
                      title="Copy product details for WhatsApp / Facebook / Instagram"
                    >
                      <MessageCircle size={16} />
                    </button>

                    {/* WhatsApp Share Button */}
                    <button
                      onClick={() => {
                        const message = formatProductForSocialShare(product);
                        const productUrl = product._id
                          ? `https://irhasinn.vercel.app/product/${product._id}`
                          : "";

                        // Build WhatsApp share URL with the message
                        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

                        // Try native share first (mobile devices) for a richer experience
                        if (navigator.share && product.images?.[0]?.url) {
                          navigator
                            .share({
                              title: product.name || "Check out this product!",
                              text: message,
                              url: productUrl || undefined,
                            })
                            .then(() => {
                              showToast("Product details ready to share!", "success");
                            })
                            .catch(() => {
                              // User cancelled or share failed — fall back to WhatsApp
                              window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                              showToast("Opening WhatsApp to share product details…", "info");
                            });
                        } else {
                          // Desktop / fallback: open WhatsApp Web with the message
                          window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                          showToast("Opening WhatsApp to share product details…", "info");
                        }
                      }}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-600 transition hover:bg-emerald-600 hover:text-white"
                      title="Share product details on WhatsApp"
                    >
                      <Share2 size={16} />
                    </button>

                    {(userRole === "superadmin" || referenceId(product.addedBy) === currentUserId) && (
                      <>
                        <button
                          onClick={() => handleEditProduct(product)}
                          className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                          aria-label="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteId(product._id)}
                          className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-600 hover:text-white"
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-10 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    {deferredSearchTerm
                      ? "No products found matching your search"
                      : "No products found"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Server-driven pagination footer (F-13) — "Showing X–Y of Z" uses the
          same server filter/page that produced the rows, so it is exact. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">
          Showing {rangeStart}–{rangeEnd} of {totalProducts} product
          {totalProducts === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || productsLoading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#0856DF]/40 hover:text-[#0856DF] disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
          >
            ← Previous
          </button>
          <span className="text-xs font-medium text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || productsLoading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#0856DF]/40 hover:text-[#0856DF] disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Edit Product Modal — the SAME shared ProductForm, edit mode */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                Edit Product
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <ProductForm
              key={editingProduct._id}
              mode="edit"
              product={editingProduct}
              categories={categories}
              subcategories={subcategories}
              categoriesLoaded={categoriesLoaded}
              onSaved={(saved) => {
                // Targeted list update (same as before) + close the modal.
                if (saved) {
                  setProducts((prev) =>
                    prev.map((p) => (p._id === saved._id ? saved : p)),
                  );
                }
                setEditingProduct(null);
              }}
              onCancel={() => setEditingProduct(null)}
            />
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertCircle size={26} className="text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">Delete Product?</h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              {products.find((p) => p._id === deleteId)?.name}
              <br />
              <span className="text-xs text-slate-400">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={isDeleting}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
