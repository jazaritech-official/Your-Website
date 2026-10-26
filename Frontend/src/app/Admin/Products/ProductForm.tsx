"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Sparkles,
  Star,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCachedPrintLayout,
  isPrintLayoutStale,
  setCachedPrintLayout,
  type PrintLayout,
} from "@/app/utils/printLayout";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import axios from "axios";
import AiGeneratorButton from "../components/AiGeneratorButton";
import { compressImage, isHeicFile, formatFileSize } from "@/app/utils/compressImage";
import type { Category, Product, SubcategoryOption } from "./productTypes";

/* ── Built-in SEO tags ───────────────────────────────────────────
   Derived live from the product data being entered (name, brand,
   category, subcategory). Purely frontend — merged into the
   submitted tag list with case-insensitive dedupe. Kept relevant
   and concise; no keyword stuffing, no generic filler words. */
const SEO_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "in", "on",
  "at", "to", "from", "by", "new", "best", "hot", "top", "premium",
  "luxury", "quality", "genuine", "original", "sale", "buy", "shop",
  "online", "store", "official", "custom", "customized", "personalized",
]);

const buildDefaultTags = (
  name: string,
  brand: string,
  categoryName: string,
  subcategoryName: string,
): string[] => {
  const clean = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\s'&-]/g, "")
      .trim();

  const tokens = (s: string) =>
    clean(s)
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !SEO_STOPWORDS.has(w));

  const words = tokens(name);
  const tags: string[] = [];

  // Base noun — the last meaningful word of the product name (e.g. "watch").
  if (words.length) tags.push(words[words.length - 1]);
  // Phrase combos from the name: "chronograph watch", "stainless steel watch".
  if (words.length >= 2) tags.push(words.slice(-2).join(" "));
  if (words.length >= 3) tags.push(words.slice(-3).join(" "));

  // Brand, category and subcategory names.
  if (clean(brand)) tags.push(clean(brand));
  if (clean(categoryName)) tags.push(clean(categoryName));
  if (clean(subcategoryName)) tags.push(clean(subcategoryName));

  // Case-insensitive dedupe, preserve order, cap at 8 concise tags.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  return unique.slice(0, 8);
};

/**
 * Interpret the POST /analyze-print-layout response.
 *
 * Backend contract (createSuccess): `{ status: 200, message, data: <layout> }`
 * — there is NO `success` field. HTTP 200 + a `data` object carrying a
 * `customizable` boolean is ALWAYS a success (a `customizable: false` layout
 * is still a valid, usable detection result). Anything else is a failure with
 * a precise reason — never a bare "detection failed".
 * Logs every decision point so future diagnosis needs no guessing.
 */
export function interpretAnalyzeResponse(
  resData: unknown,
): { layout: PrintLayout | null; reason: string | null } {
  const body = (resData ?? {}) as {
    status?: number;
    message?: string;
    errorCode?: string;
    stage?: string;
    data?: unknown;
  };
  // Annotate failure messages with the structured stage/code so admins (and
  // the list badge tooltip) see exactly where analysis failed.
  const annotate = (fallback: string): string => {
    const base = body.message || fallback;
    if (body.stage || body.errorCode) {
      return `${base} (stage=${body.stage ?? "?"}, code=${body.errorCode ?? "?"})`;
    }
    return base;
  };
  const shapeKeys =
    resData && typeof resData === "object"
      ? Object.keys(resData as Record<string, unknown>)
      : [];
  const layout = (body.data ?? null) as PrintLayout | null;

  console.log("[PrintLayout] HTTP status:", body.status ?? "(missing)");
  console.log("[PrintLayout] backend message:", body.message ?? "(missing)");
  console.log("[PrintLayout] response shape:", shapeKeys);
  console.log(
    "[PrintLayout] extracted layout:",
    layout && typeof layout === "object"
      ? {
        customizable: layout.customizable,
        sampleText: layout.sampleText ?? null,
        hasTextLayer: !!layout.textLayer,
        layerCount: Array.isArray(layout.textLayers)
          ? layout.textLayers.length
          : layout.textLayer
            ? 1
            : 0,
        renderVersion: layout.renderVersion ?? null,
      }
      : null,
  );

  if (body.status !== 200) {
    console.log("[PrintLayout] validation result: FAIL — status != 200");
    return {
      layout: null,
      reason: annotate(`Backend returned HTTP ${body.status}`),
    };
  }
  if (!layout || typeof layout !== "object") {
    console.log(
      "[PrintLayout] validation result: FAIL — data missing or not an object",
    );
    return {
      layout: null,
      reason: annotate("Backend returned no layout data"),
    };
  }
  if (layout.customizable === undefined) {
    console.log(
      "[PrintLayout] validation result: FAIL — data.customizable undefined",
    );
    return {
      layout: null,
      reason: annotate("Layout missing the customizable field"),
    };
  }
  console.log("[PrintLayout] validation result: PASS");
  return { layout, reason: null };
}

const nextImageUid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Release a blob preview URL (remote Cloudinary URLs are left alone). */
const revokePreview = (url?: string) => {
  if (typeof url === "string" && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch { /* already revoked — safe to ignore */ }
  }
};

/** Error shape used by every catch block below (no `any` needed). */
interface ApiErrorLike {
  name?: string;
  code?: string;
  message?: string;
  response?: { status?: number; data?: { message?: string; code?: string; stage?: string; errorCode?: string } };
}

const asApiError = (err: unknown): ApiErrorLike =>
  err && typeof err === "object" ? (err as ApiErrorLike) : {};

interface CustomizationField {
  fieldType: string;
  label: string;
  required: boolean;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  stock: string;
  brand: string;
  category: string;
  subcategory: string;
  tags: string;
  colors: string;
  sizes: string;
  freeShipping: boolean;
  shippingCharge: string;
  customizable: boolean;
  showCustomizationPreview: boolean;
  customizationFields: CustomizationField[];
  printLayout: PrintLayout | null;
}

/** Fresh create-mode form state (previously `handleOpenModal`'s reset). */
const emptyFormState = (brand = ""): FormState => ({
  name: "",
  description: "",
  price: "",
  stock: "",
  brand,
  category: "",
  subcategory: "",
  tags: "",
  colors: "",
  sizes: "",
  freeShipping: false,
  shippingCharge: "",
  customizable: false,
  showCustomizationPreview: true,
  customizationFields: [],
  printLayout: null,
});

/** Edit-mode form state built from the stored product (previously
    `handleEditProduct`). */
const formStateFromProduct = (product: Product): FormState => ({
  name: product.name,
  description: product.description,
  price: product.price.toString(),
  stock: product.stock.toString(),
  brand: product.brand.toString(),
  // getAdminProducts populates category as an object — store the ObjectId
  // string so the select matches an <option value> and the payload stays
  // clean (FormData would stringify an object to "[object Object]").
  category:
    typeof product.category === "object" && product.category?._id
      ? product.category._id
      : (product.category as string) || "",
  subcategory:
    typeof product.subcategory === "object" && product.subcategory?._id
      ? product.subcategory._id
      : (product.subcategory as string) || "",
  tags: product.tags?.join(", ") || "",
  colors: product.colors?.join(", ") || "",
  sizes: product.sizes?.join(", ") || "",
  freeShipping: product.freeShipping ?? false,
  shippingCharge: product.shippingCharge ? product.shippingCharge.toString() : "",
  customizable: product.customizable ?? false,
  showCustomizationPreview: product.showCustomizationPreview ?? true,
  customizationFields: product.customizationFields || [],
  printLayout: product.printLayout ?? null,
});

const variantMapFromProduct = (
  value: Record<string, number> | undefined,
): Record<string, string> => {
  const out: Record<string, string> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) out[k] = String(v);
  }
  return out;
};

interface ImageItemMeta {
  id: string;
  /** SEO alt text — editable by the admin, auto-suggested when empty. */
  alt: string;
  aiSuggested: boolean;
  /** Existing Cloudinary asset id (edit mode) — never re-uploaded. */
  publicId?: string;
  width?: number;
  height?: number;
  quality: "good" | "low" | "very-low" | "unknown";
}

export interface ProductFormProps {
  /** "create" posts a new product, "edit" updates `product`. */
  mode: "create" | "edit";
  /** Product being edited (edit mode only). */
  product?: Product | null;
  categories: Category[];
  subcategories: SubcategoryOption[];
  /** Gate for the size-based pricing fields (category settings loaded). */
  categoriesLoaded: boolean;
  /** Called after a successful create/update. `product` is null when the API
      returned success without a body. The host owns navigation/modal state. */
  onSaved: (product: Product | null, mode: "create" | "edit") => void;
  /** Called when the admin cancels (modal close / page back). */
  onCancel: () => void;
}

/**
 * The single Add/Edit Product form.
 *
 * This is a VERBATIM move of the form that used to live inside the Products
 * page modal — same fields, validation order, messages, payload construction,
 * submission protection, image pipeline, AI helpers and API contracts. Only
 * the presentation container changed: the Products page hosts it inside the
 * Edit modal, the dedicated Add Product page hosts it as a page body.
 */
const ProductForm = ({
  mode,
  product = null,
  categories,
  subcategories,
  categoriesLoaded,
  onSaved,
  onCancel,
}: ProductFormProps) => {
  const isEditMode = mode === "edit";

  const [formData, setFormData] = useState<FormState>(() =>
    isEditMode && product ? formStateFromProduct(product) : emptyFormState("Irhas'Inn"),
  );
  // Variant pricing: { "Color__Size": price, "Size": price }
  const [variantPricing, setVariantPricing] = useState<Record<string, string>>(
    () => (isEditMode && product ? variantMapFromProduct(product.variantPricing) : {}),
  );
  // Variant stock: { "Color__Size": stock, "Size": stock }
  const [variantStock, setVariantStock] = useState<Record<string, string>>(
    () => (isEditMode && product ? variantMapFromProduct(product.variantStock) : {}),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Suggested quick-add values for SEO tags, colors and sizes
  const suggestedTags = ["Trending", "New", "Sale", "Bestseller", "Limited", "onlineshopping", "karachi", "pakistan", "fashion", "clothing", "accessories", "electronics", "home decor", "gifts", "handmade"];
  const suggestedColors = ["Red", "Blue", "Green", "Black", "White"];
  const suggestedSizes = ["XS", "S", "M", "L", "XL", "XXL"];

  const addSuggestedValue = (field: "tags" | "colors" | "sizes", value: string) => {
    setFormData((prev) => {
      const current = (prev[field] || "").split(",").map((s) => s.trim()).filter(Boolean);
      // Case-insensitive dedupe — "Watch" / "watch" / "WATCH" are one tag.
      if (current.some((s) => s.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [field]: [...current, value].join(", ") };
    });
  };

  // Determine if product uses size-based pricing/stock (sizes present)
  const hasSizes = useMemo(() => {
    const sizeList = formData.sizes.split(",").map((s) => s.trim()).filter(Boolean);
    return sizeList.length > 0;
  }, [formData.sizes]);

  // Whether the selected category uses size-based pricing & stock.
  // Read from the category's `usesSizeBasedPricing` flag (Admin-configurable
  // per category, replacing the old hardcoded "T-Shirt" name check).
  //
  // FIX: categories load asynchronously via useFetch, but the edit modal opens
  // synchronously. On the first render after opening, `categories` is [] so
  // `categoryUsesSizeBasedPricing` is always `false` — the Price/Stock inputs
  // become editable even for size-based products. If the admin submits during
  // this race window the base price/stock can overwrite variant values.
  // `categoriesLoaded` gates the fields until the real category data arrives.
  const categoryUsesSizeBasedPricing = useMemo(() => {
    if (!formData.category) return false;
    const cat = categories.find((c) => c._id === formData.category);
    return cat?.usesSizeBasedPricing === true;
  }, [formData.category, categories]);

  // Built-in SEO tags — regenerated live from the product data above.
  const selectedCategoryName =
    categories.find((c) => c._id === formData.category)?.name ?? "";
  const selectedSubcategoryName =
    subcategories.find((s) => s._id === formData.subcategory)?.name ?? "";
  const defaultSeoTags = useMemo(
    () =>
      buildDefaultTags(
        formData.name,
        formData.brand,
        selectedCategoryName,
        selectedSubcategoryName,
      ),
    [formData.name, formData.brand, selectedCategoryName, selectedSubcategoryName],
  );
  // Suggestions the admin dismissed (clicked ×) — excluded from the final list.
  const [removedDefaultTags, setRemovedDefaultTags] = useState<Set<string>>(
    () => new Set(),
  );

  // images stays parallel with previewUrls/imageMeta: new File selections, or
  // null placeholders for EXISTING Cloudinary images in edit mode.
  const [images, setImages] = useState<(File | null)[]>(() =>
    isEditMode ? product?.images?.map(() => null) || [] : [],
  );
  const [previewUrls, setPreviewUrls] = useState<string[]>(() =>
    isEditMode ? product?.images?.map((img) => img.url) || [] : [],
  );
  const [imageMeta, setImageMeta] = useState<ImageItemMeta[]>(() =>
    isEditMode
      ? (product?.images || []).map((img) => ({
        id: nextImageUid(),
        alt: img.alt || "",
        aiSuggested: false,
        publicId: img.public_id,
        quality: "unknown" as const,
      }))
      : [],
  );
  const [dragActive, setDragActive] = useState(false); // dropzone highlight
  const [dragIdx, setDragIdx] = useState<number | null>(null); // thumbnail dnd
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [aiAltIndex, setAiAltIndex] = useState<number | null>(null);
  // Oversized image rejection modal
  const [oversizedImageModal, setOversizedImageModal] = useState<{
    fileName: string;
    fileSize: number;
  } | null>(null);
  const dragCounterRef = useRef(0); // track nested dragenter/leave

  /* ── Fixed overlays (lightbox / oversized-image dialog) are rendered in a
     portal so they stay viewport-fixed even though the form itself can be
     hosted inside the Edit modal (whose backdrop-filter would otherwise
     become the containing block and clip them). ── */
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document !== "undefined") setPortalHost(document.body);
  }, []);

  /* ── AI Name & Description from Image (additive — see handleGenerateFromImage) ── */
  const [generatingFromImage, setGeneratingFromImage] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0); // seconds since AI generation started
  const metadataRequestRef = useRef(0); // race-condition guard token
  const aiAbortRef = useRef<AbortController | null>(null); // for cancelling AI requests

  /* ── AI Print Layout (admin-side, runs ONCE per product image) ── */
  const [analyzingLayout, setAnalyzingLayout] = useState(false);
  const layoutAbortRef = useRef<AbortController | null>(null);
  const autoAnalyzedRef = useRef(false);
  // Persistent detection status — never silently fail (✓ detected / ⚠ failed).
  const [layoutStatus, setLayoutStatus] = useState<"idle" | "detected" | "failed">(
    isEditMode && product?.printLayout ? "detected" : "idle",
  );
  const [layoutError, setLayoutError] = useState<string>("");

  const runLayoutDetection = async (imageUrl: string, force = false) => {
    // The offline mirror is only a shortcut for NON-forced runs — an explicit
    // "Detect Layout" click (force) always re-analyzes so prompt/model
    // improvements take effect instead of silently re-serving the old layout.
    if (!force) {
      const cached = getCachedPrintLayout(imageUrl);
      if (cached) {
        setFormData((prev) => ({ ...prev, printLayout: cached }));
        setLayoutStatus("detected");
        setLayoutError("");
        showToast("Print layout loaded from cache — no AI call needed", "success");
        return;
      }
    }

    // Create abort controller for cancellation
    const controller = new AbortController();
    layoutAbortRef.current = controller;

    setAnalyzingLayout(true);
    setLayoutStatus("idle");
    setLayoutError("");
    try {
      const res = await axios.post(
        `${baseUrl}product/analyze-print-layout`,
        { imageUrl, force: force === true },
        { withCredentials: true, signal: controller.signal },
      );
      // Backend contract: { status: 200, message, data: <layout> } — there is
      // NO `success` field. HTTP 200 + data.customizable present = SUCCESS.
      const { layout, reason } = interpretAnalyzeResponse(res.data);
      if (layout) {
        console.log("[PrintLayout] final: SUCCESS");
        setFormData((prev) => ({ ...prev, printLayout: layout }));
        setCachedPrintLayout(imageUrl, layout);
        setLayoutStatus("detected");
        setLayoutError("");
        showToast(
          layout.customizable === false
            ? "Analysis complete — no printable surface found on this image"
            : "Print layout detected — customers will now see a live preview",
          layout.customizable === false ? "warn" : "success",
        );
      } else {
        console.error("[PrintLayout] final: FAILURE —", reason, res.data);
        const message = reason || "Could not detect a print layout";
        setLayoutStatus("failed");
        setLayoutError(message);
        showToast(message, "error");
      }
    } catch (err: unknown) {
      const apiError = asApiError(err);
      // Handle cancellation
      if (apiError.name === "CanceledError" || apiError.code === "ERR_CANCELED") {
        showToast("Layout detection cancelled", "info");
        return;
      }
      console.error(
        "[PrintLayout] detection failed — backend stage:",
        apiError.response?.data || err,
      );
      const message =
        apiError.response?.data?.message || "AI analysis failed. Please try again.";
      setLayoutStatus("failed");
      setLayoutError(message);
      showToast(message, "error");
    } finally {
      layoutAbortRef.current = null;
      setAnalyzingLayout(false);
    }
  };

  const handleAnalyzeLayout = async () => {
    const remoteUrl = previewUrls.find((u) => /^https?:\/\//.test(u)) || "";
    if (!remoteUrl) {
      showToast(
        "Save the product first — the layout is detected from the uploaded product photo.",
        "warn",
      );
      return;
    }
    // The admin explicitly clicked "Detect Layout" — always re-analyze so a
    // tightened detection prompt / model update takes effect immediately.
    await runLayoutDetection(remoteUrl, true);
  };

  // Auto-detect ONCE when an admin opens a customizable product that already
  // has a product photo but no stored layout — OR when the stored layout is
  // STALE (the product image changed since detection; layout.sourceImage is
  // the image that was analyzed). Never runs at customer runtime.
  // (Previously also gated on `isModalOpen`; the form is now only mounted while
  // its host — modal or page — is open, so the gate is preserved implicitly.)
  useEffect(() => {
    if (autoAnalyzedRef.current) return;
    // Only customizable products need a print layout — don't burn a Gemini
    // vision call (and the route's rate budget) on every non-customizable
    // product edit. Manual "Detect Layout" still works regardless.
    if (!formData.customizable) return;
    if (!previewUrls.length) return;
    const remoteUrl = previewUrls.find((u) => /^https?:\/\//.test(u)) || "";
    if (!remoteUrl) return;
    if (
      formData.printLayout &&
      !isPrintLayoutStale(formData.printLayout, remoteUrl)
    ) {
      return;
    }
    autoAnalyzedRef.current = true;
    runLayoutDetection(remoteUrl);
  }, [formData.customizable, formData.printLayout, previewUrls]);

  /* ── Image validation (matches the backend multer limits) ── */
  const MAX_IMAGES = 5;
  const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // Vercel-safe: 4MB per file (frontend pre-check)
  const ACCEPTED_IMAGE_TYPES = [
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/gif", "image/bmp", "image/avif",
    "image/heic", "image/heif",
    "image/tiff", "image/tif",
  ];
  const ACCEPTED_IMAGE_EXT = /\.(jpe?g|jfif|png|webp|gif|bmp|avif|heic|heif|tiff|tif)$/i;
  const isAcceptedImage = (file: File) =>
    ACCEPTED_IMAGE_TYPES.includes(file.type) || ACCEPTED_IMAGE_EXT.test(file.name);

  /** Reads real image dimensions via the browser — no re-encoding, no AI. */
  const loadImageDimensions = (file: File) =>
    new Promise<{ width: number; height: number } | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });

  const addingRef = useRef(false); // one batch at a time (picker + drop race guard)

  /** Shared pipeline for picker + drag & drop: validate → quality-check → add. */
  const addFiles = async (fileList: FileList | File[]) => {
    if (isSubmitting || addingRef.current) return;
    addingRef.current = true;
    try {
      await addFilesInner(fileList);
    } finally {
      addingRef.current = false;
    }
  };

  const addFilesInner = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const currentCount = previewUrls.length;
    if (currentCount >= MAX_IMAGES) {
      showToast("Maximum 5 images allowed", "error");
      return;
    }
    const remaining = MAX_IMAGES - currentCount;
    let accepted = incoming;
    if (incoming.length > remaining) {
      accepted = incoming.slice(0, remaining);
      showToast(
        `Maximum 5 images allowed — added ${remaining} of ${incoming.length}`,
        "warn",
      );
    }

    const addedFiles: File[] = [];
    const addedPreviews: string[] = [];
    const addedMeta: ImageItemMeta[] = [];
    let lowResCount = 0;

    try {
      for (const file of accepted) {
        if (!isAcceptedImage(file)) {
          if (isHeicFile(file)) {
            showToast(`"${file.name}" is a HEIC image — converting automatically...`, "info");
          } else {
            showToast(`"${file.name}" is not a supported image format. Use JPG, PNG, WebP, GIF, or AVIF.`, "error");
            continue;
          }
        }

        // Normalize every image client-side (consistent format + bounded size)
        // imageIndex determines primary (0) vs secondary quality profile
        const imageIndex = images.length + addedFiles.length;
        let processedFile: File = file;
        const result = await compressImage(file, imageIndex);
        if (result.compressed) {
          processedFile = result.file;
          const savedPct = Math.round((1 - result.compressedSize / result.originalSize) * 100);
          if (savedPct > 5) {
            showToast(
              `Compressed "${file.name}" from ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} (-${savedPct}%)`,
              "info",
            );
          }
        }
        // Final safety check — if after normalization the file is still too large
        if (processedFile.size > MAX_IMAGE_SIZE) {
          setOversizedImageModal({ fileName: file.name, fileSize: processedFile.size });
          continue;
        }

        // Dedup check (use original name + size to catch re-selected files)
        const isDuplicate = [...images, ...addedFiles].some(
          (f) => !!f && f.name === file.name && f.size === file.size,
        );
        if (isDuplicate) {
          showToast(`"${file.name}" is already added`, "warn");
          continue;
        }
        const dims = await loadImageDimensions(processedFile);
        if (!dims) {
          showToast(`Unable to read "${file.name}" — the file may be corrupt or in an unsupported format.`, "error");
          continue;
        }
        const minDim = Math.min(dims.width, dims.height);
        if (minDim < 500) {
          lowResCount += 1;
          showToast(`"${file.name}" is very low resolution (${dims.width}×${dims.height})`, "warn");
        } else if (minDim < 800) {
          lowResCount += 1;
        }
        addedFiles.push(processedFile);
        addedPreviews.push(URL.createObjectURL(processedFile));
        addedMeta.push({
          id: nextImageUid(),
          alt: "",
          aiSuggested: false,
          width: dims.width,
          height: dims.height,
          quality: minDim < 500 ? "very-low" : minDim < 800 ? "low" : "good",
        });
      }
    } catch {
      showToast("Could not process one or more images", "error");
      return;
    }

    if (addedFiles.length === 0) return;
    setImages((prev) => [...prev, ...addedFiles]);
    setPreviewUrls((prev) => [...prev, ...addedPreviews]);
    setImageMeta((prev) => [...prev, ...addedMeta]);
    if (lowResCount > 0) {
      showToast(
        lowResCount === 1
          ? "One image is low resolution — quality badge shown below"
          : `${lowResCount} images are low resolution — quality badges shown below`,
        "warn",
      );
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file later
  };

  const removeImage = (index: number) => {
    const url = previewUrls[index];
    setImageMeta((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
    setImages((prev) => prev.filter((_, i) => i !== index));
    revokePreview(url);
  };

  /** Reorder one image (drag & drop or move arrows). Keeps all arrays in sync. */
  const moveImage = (from: number, to: number) => {
    const n = previewUrls.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setPreviewUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setImageMeta((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /** The FIRST image is the primary product image (existing Irhas'Inn
      convention) — setting a primary moves it to the front; the order is
      persisted on save, so no schema/migration is needed. */
  const setPrimary = (index: number) => {
    moveImage(index, 0);
    showToast("Primary image updated", "success");
  };

  const updateAlt = (index: number, value: string) => {
    setImageMeta((prev) =>
      prev.map((m, i) => (i === index ? { ...m, alt: value, aiSuggested: false } : m)),
    );
  };

  const suggestAlt = (index: number) => {
    const alt = buildFallbackAlt();
    setImageMeta((prev) =>
      prev.map((m, i) => (i === index ? { ...m, alt, aiSuggested: false } : m)),
    );
    if (!formData.name.trim()) {
      showToast("Tip: fill the product name for better alt text", "info");
    }
  };

  /** AI alt suggestion — reuses the existing product-metadata endpoint (no new AI). */
  const aiSuggestAlt = async (index: number) => {
    if (isSubmitting || aiAltIndex !== null) return;
    const file = images[index];
    if (!file) {
      suggestAlt(index); // existing Cloudinary images use the deterministic suggestion
      return;
    }
    setAiAltIndex(index);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const categoryValue = formData.category;
      const categoryName = categories.find((c) => c._id === categoryValue)?.name;
      if (categoryName) fd.append("category", categoryName);
      if (formData.name.trim()) fd.append("name", formData.name.trim());
      const res = await axios.post(
        `${baseUrl}product/ai/generate-product-metadata`,
        fd,
        { withCredentials: true, timeout: 60_000 },
      );
      const data = res.data?.data;
      const suggestedName =
        data && typeof data.name === "string" && data.name.trim()
          ? data.name.trim()
          : buildFallbackAlt();
      const brand = formData.brand.trim();
      const alt =
        brand && !suggestedName.toLowerCase().includes(brand.toLowerCase())
          ? `${suggestedName} by ${brand}`
          : suggestedName;
      setImageMeta((prev) =>
        prev.map((m, i) => (i === index ? { ...m, alt, aiSuggested: true } : m)),
      );
      showToast("AI suggested alt text — review & edit as needed", "success");
    } catch (err: unknown) {
      const apiError = asApiError(err);
      showToast(apiError.response?.data?.message || "AI could not suggest alt text", "error");
      suggestAlt(index); // deterministic fallback — creation is never blocked by AI
    } finally {
      setAiAltIndex(null);
    }
  };

  /* ── Drag & drop handlers (upload area) ── */
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragActive(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    if (e.dataTransfer?.files) void addFiles(e.dataTransfer.files);
  };

  /* ── Thumbnail drag handlers (reorder) ── */
  const handleThumbDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDragIdx(idx);
  };
  const handleThumbDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault(); // required to allow the drop
    setOverIdx(idx);
  };
  const handleThumbDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) moveImage(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  };

  /* ── Object-URL lifecycle ──
     The old modal released preview object URLs inside `closeModal`. The form
     now unmounts when its host closes, so the same release happens on unmount
     (plus on individual removal via revokePreview) — no leaked blobs. */
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);
  useEffect(
    () => () => {
      previewUrlsRef.current.forEach(revokePreview);
    },
    [],
  );

  /** Image preview lightbox keyboard support: ESC close, ← / → navigate. */
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") {
        setLightboxIndex((cur) =>
          cur === null ? cur : (cur + previewUrls.length - 1) % previewUrls.length,
        );
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((cur) =>
          cur === null ? cur : (cur + 1) % previewUrls.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, previewUrls.length]);

  // Elapsed-time timer for AI generation progress indicator
  useEffect(() => {
    if (!generatingFromImage) { setAiElapsed(0); return; }
    setAiElapsed(0);
    const interval = setInterval(() => setAiElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [generatingFromImage]);

  /** Deterministic alt-text fallback — product creation must never depend on AI. */
  const buildFallbackAlt = () => {
    const name = formData.name.trim();
    const brand = formData.brand.trim();
    if (name) {
      return brand && !name.toLowerCase().includes(brand.toLowerCase())
        ? `${name} by ${brand}`
        : name;
    }
    return formData.description.trim().slice(0, 80) || "Product image";
  };

  /* ── AI Name & Description from the selected image (additive) ──
     Sends the FIRST newly selected image file (multipart) to
     POST /product/ai/generate-product-metadata. The image is only
     analyzed — it is never uploaded to Cloudinary by this step. */
  const handleGenerateFromImage = async () => {
    if (generatingFromImage || isSubmitting) return; // one at a time, never during submit
    const file = images.find((f): f is File => !!f); // first NEWLY selected image
    if (!file) return;

    // Create abort controller for cancellation
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setGeneratingFromImage(true);
    const token = ++metadataRequestRef.current;
    try {
      // Resolve the human-readable category name (never the ObjectId).
      const categoryValue = formData.category;
      const categoryName = categories.find((c) => c._id === categoryValue)?.name;

      const fd = new FormData();
      fd.append("image", file);
      if (categoryName) fd.append("category", categoryName);
      if (formData.name.trim()) fd.append("name", formData.name.trim());
      if (formData.description.trim()) {
        fd.append("description", formData.description.trim());
      }

      const res = await axios.post(
        `${baseUrl}product/ai/generate-product-metadata`,
        fd,
        { withCredentials: true, timeout: 60_000, signal: controller.signal },
      );

      // Race guard: discard stale responses (image removed/changed mid-request).
      if (token !== metadataRequestRef.current) return;
      if (!images.includes(file)) return;

      const data = res.data?.data;
      if (
        !data ||
        typeof data.name !== "string" ||
        typeof data.description !== "string" ||
        !data.name.trim() ||
        !data.description.trim()
      ) {
        showToast("AI returned incomplete product details", "error");
        return;
      }
      setFormData((prev) => ({
        ...prev,
        name: data.name,
        description: data.description,
      }));
      showToast("Name & description generated from image", "success");
    } catch (err: unknown) {
      if (token !== metadataRequestRef.current) return;
      const apiError = asApiError(err);
      // Axios cancels with name="CanceledError" when AbortController.abort() is called
      if (apiError.name === "CanceledError" || apiError.code === "ERR_CANCELED") {
        showToast("AI generation cancelled", "info");
        return;
      }
      const message =
        apiError.response?.data?.message ||
        "AI could not analyze this image. Please try again.";
      showToast(message, "error");
      // Existing values stay untouched; form stays open; Submit never blocked.
    } finally {
      aiAbortRef.current = null;
      if (token === metadataRequestRef.current) setGeneratingFromImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const missingFields = [];

    // Har field ko check karein aur agar khali ho to array mein naam push kar dein
    if (!formData.name?.trim()) missingFields.push("Name");
    if (!formData.description?.trim()) missingFields.push("Description");
    // For size-based products and size-based-pricing categories, global
    // Price/Stock are optional — the variant matrix handles them.
    // FIX: Also guard against submitting while categories are still loading,
    // which would send stale price/stock values for size-based products.
    if (!categoriesLoaded) {
      showToast("Please wait for category settings to load before saving.", "error");
      return;
    }
    if (!hasSizes && !categoryUsesSizeBasedPricing) {
      if (!formData.price) missingFields.push("Price");
      if (!formData.stock) missingFields.push("Stock");
    }
    if (!formData.brand) missingFields.push("Brand");
    if (!formData.category) missingFields.push("Category");

    // Agar array mein koi bhi item hai, iska matlab koi field missing hai
    if (missingFields.length > 0) {
      showToast(
        `Please fill these fields: ${missingFields.join(", ")}`,
        "error",
      );
      return;
    }

    if (!isEditMode && !images.some((f) => f)) {
      showToast("At least one image is required", "error");
      return;
    }

    if (formData.customizable) {
      const labels = formData.customizationFields
        .map((f) => (f.label || "").trim().toLowerCase())
        .filter(Boolean);
      const uniqueLabels = new Set(labels);
      if (labels.length !== uniqueLabels.size) {
        showToast("Customization fields must have unique labels", "error");
        return;
      }
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const submitData = new FormData();
      submitData.append("name", formData.name);
      submitData.append("description", formData.description);
      // FIX: When size-wise pricing is active (category flag OR sizes present),
      // do NOT send the stale flat price — it would overwrite variantPricing
      // on the backend and leave an inconsistent product document with both
      // a flat price AND variant prices. Send "0" so the backend knows to
      // clear the flat price when variantPricing is the source of truth.
      const isSizeWisePricing = hasSizes || categoryUsesSizeBasedPricing;
      submitData.append("price", isSizeWisePricing ? "0" : formData.price);
      // FIX: When size-wise pricing is OFF, also clear variant data so old
      // per-size prices don't linger from a previous toggle.
      // Note: we override the local variables used below, not setState
      // (setState would not take effect until next render).
      submitData.append("stock", formData.stock);
      // Defensive: never let a populated category object reach FormData (it
      // would be stringified to "[object Object]" → 500 on the backend).
      submitData.append("category", formData.category);
      // Subcategory is optional — always sent ("" = none) so the backend can
      // validate the category/subcategory pairing and clear stale selections.
      submitData.append("subcategory", formData.subcategory || "");
      submitData.append("brand", formData.brand);

      // Manual tags + built-in SEO tags (derived from the product data) are
      // merged into one list — case-insensitive dedupe, order preserved.
      const manualTags = formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const activeDefaults = defaultSeoTags.filter(
        (t) => !removedDefaultTags.has(t.toLowerCase()),
      );
      const mergedTags: string[] = [];
      const seenTag = new Set<string>();
      for (const t of [...activeDefaults, ...manualTags]) {
        const key = t.toLowerCase();
        if (seenTag.has(key)) continue;
        seenTag.add(key);
        mergedTags.push(t);
      }
      if (mergedTags.length) {
        submitData.append("tags", mergedTags.join(","));
      }

      if (formData.colors.trim()) {
        submitData.append(
          "colors",
          formData.colors.split(",").map((c) => c.trim()).filter(Boolean).join(","),
        );
      }

      if (formData.sizes.trim()) {
        submitData.append(
          "sizes",
          formData.sizes.split(",").map((s) => s.trim()).filter(Boolean).join(","),
        );
      }

      // Variant pricing: convert { "key": "price" } to { "key": number }
      // FIX: When size-wise pricing is OFF, send empty object so the backend
      // clears any stale variant data — prevents old per-size prices lingering.
      const cleanedVariantPricing: Record<string, number> = {};
      if (isSizeWisePricing) {
        for (const [k, v] of Object.entries(variantPricing)) {
          const num = Number(v);
          if (v && !isNaN(num) && num >= 0) {
            cleanedVariantPricing[k] = num;
          }
        }
      }
      submitData.append("variantPricing", JSON.stringify(cleanedVariantPricing));

      // Variant stock: convert { "key": "stock" } to { "key": number }
      // FIX: Same symmetry — clear variantStock when size-wise pricing is OFF.
      const cleanedVariantStock: Record<string, number> = {};
      if (isSizeWisePricing) {
        for (const [k, v] of Object.entries(variantStock)) {
          const num = Number(v);
          if (v && !isNaN(num) && num >= 0) {
            cleanedVariantStock[k] = num;
          }
        }
      }
      submitData.append("variantStock", JSON.stringify(cleanedVariantStock));

      // Shipping fields
      submitData.append("freeShipping", formData.freeShipping ? "true" : "false");
      if (!formData.freeShipping) {
        submitData.append("shippingCharge", formData.shippingCharge || "0");
      }

      // Customization fields
      submitData.append("customizable", formData.customizable ? "true" : "false");
      submitData.append("showCustomizationPreview", formData.showCustomizationPreview ? "true" : "false");
      if (formData.customizable && formData.customizationFields.length > 0) {
        submitData.append("customizationFields", JSON.stringify(formData.customizationFields));
      }

      // AI print layout — stored with the product; customer previews render
      // from it with ZERO AI at runtime (detected once per product image).
      submitData.append("printLayout", JSON.stringify(formData.printLayout || null));

      // Image order + alt text: imagesMeta tells the backend the final image
      // list (existing images by public_id, new files by upload index) so the
      // admin's reordering, primary (first position) and alt text persist.
      const imagesMetaPayload: Array<{
        file?: number;
        publicId?: string;
        alt: string;
      }> = [];
      let fileIndex = 0;
      const hasName = !!formData.name.trim();
      imageMeta.forEach((meta, i) => {
        const file = images[i];
        // Empty alts fall back to "<name> by <brand>"; vary the suffix so
        // multi-image galleries never repeat identical alt text.
        const alt =
          meta.alt.trim() ||
          (previewUrls.length > 1 && hasName
            ? `${buildFallbackAlt()} — view ${i + 1}`
            : buildFallbackAlt());
        if (file) {
          imagesMetaPayload.push({ file: fileIndex++, alt });
          submitData.append("images", file);
        } else if (meta.publicId) {
          imagesMetaPayload.push({ publicId: meta.publicId, alt });
        }
      });
      submitData.append("imagesMeta", JSON.stringify(imagesMetaPayload));

      // ── Payload size diagnostic (safe — no credentials, no image data) ──
      {
        let imageBytes = 0;
        let imageCount = 0;
        images.forEach((f) => {
          if (f) { imageBytes += f.size; imageCount++; }
        });
        const variantPricingBytes = new Blob([JSON.stringify(cleanedVariantPricing)]).size;
        const variantStockBytes = new Blob([JSON.stringify(cleanedVariantStock)]).size;
        const textFieldsBytes = new Blob([
          formData.name, formData.description, formData.brand, formData.tags,
          formData.colors, formData.sizes,
          JSON.stringify(cleanedVariantPricing),
          JSON.stringify(cleanedVariantStock),
          JSON.stringify(imagesMetaPayload),
          JSON.stringify(formData.printLayout || null),
          JSON.stringify(formData.customizationFields || []),
        ]).size;
        console.log(
          `[Product Add] Payload size diagnostic:\n` +
          `  Images: ${imageCount} files, ${(imageBytes / (1024 * 1024)).toFixed(2)} MB\n` +
          `  Variant pricing data: ${(variantPricingBytes / 1024).toFixed(1)} KB\n` +
          `  Variant stock data: ${(variantStockBytes / 1024).toFixed(1)} KB\n` +
          `  Text fields (approx): ${(textFieldsBytes / 1024).toFixed(1)} KB\n` +
          `  Estimated total: ${((imageBytes + textFieldsBytes) / (1024 * 1024)).toFixed(2)} MB`
        );
      }

      if (isEditMode && product) {
        // Update product
        const response = await axios.put(
          `${baseUrl}product/updateProduct/${product._id}`,
          submitData,
          {
            withCredentials: true,
            onUploadProgress: (e) =>
              setUploadProgress(
                e.total ? Math.min(99, Math.round((e.loaded / e.total) * 100)) : 0,
              ),
          },
        );

        if (response.data?.data) {
          showToast("Product updated successfully", "success");
        }
        onSaved((response.data?.data as Product | undefined) ?? null, "edit");
      } else {
        // Create product
        const response = await axios.post(
          `${baseUrl}product/addProduct`,
          submitData,
          {
            withCredentials: true,
            onUploadProgress: (e) =>
              setUploadProgress(
                e.total ? Math.min(99, Math.round((e.loaded / e.total) * 100)) : 0,
              ),
          },
        );

        if (response.data) {
          showToast("Product created successfully", "success");
        }
        onSaved((response.data?.data as Product | undefined) ?? null, "create");
      }
    } catch (error: unknown) {
      const apiError = asApiError(error);
      let errorMessage = "Failed to save product";

      // Handle 413 Content Too Large (Vercel serverless body limit)
      // Vercel 413s often arrive WITHOUT a JSON body — handle gracefully
      if (apiError.response?.status === 413) {
        errorMessage =
          apiError.response?.data?.message ||
          "Image is too large to upload. Please choose a smaller image (max 4MB per file) — the system will auto-compress large images automatically.";
      } else if (!apiError.response && apiError.code === "ERR_NETWORK") {
        // Network error — request never reached the server
        errorMessage = "Network error — could not reach the server. Please check your connection and try again.";
      } else if (apiError.response?.data?.message) {
        // Standard API error with message
        errorMessage = apiError.response.data.message;
      } else if (apiError.message?.includes("timeout")) {
        errorMessage = "Upload timed out — the image may be too large or your connection is slow. Please try a smaller image.";
      }

      showToast(errorMessage, "error");
      console.error(error);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-6 py-5">
      {/* Images Section — drag & drop, primary, reorder, quality, alt */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
          Product Images (Max 5)
        </label>

        {/* Dropzone: click to browse OR drag & drop */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-3 text-center transition-colors ${dragActive
            ? "border-[#0856DF] bg-[#0856DF]/5"
            : "border-slate-300 hover:border-slate-400"
            }`}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageSelect}
            disabled={isSubmitting || previewUrls.length >= 5}
            className="hidden"
            id="image-input"
          />
          <label
            htmlFor="image-input"
            className="flex cursor-pointer flex-col items-center gap-1.5"
          >
            <Upload
              size={20}
              className={dragActive ? "text-[#0856DF]" : "text-slate-400"}
            />
            <p className="text-xs font-semibold text-slate-600">
              {dragActive
                ? "Drop images to upload"
                : "Drag & drop images here · or click to browse"}
            </p>
            <p className="text-[11px] text-slate-400">
              {previewUrls.length}/5 images · JPG, PNG, WEBP · max 8MB each
            </p>
          </label>
        </div>

        {/* Image cards: primary badge, quality, zoom, reorder, alt text */}
        {previewUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {previewUrls.map((url, idx) => {
              const meta = imageMeta[idx];
              const isPrimary = idx === 0;
              const quality = meta?.quality || "unknown";
              return (
                <div
                  key={meta?.id ?? idx}
                  draggable={!isSubmitting}
                  onDragStart={(e) => handleThumbDragStart(e, idx)}
                  onDragOver={(e) => handleThumbDragOver(e, idx)}
                  onDrop={(e) => handleThumbDrop(e, idx)}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  className={`group relative overflow-hidden rounded-xl border bg-white transition ${isPrimary
                    ? "border-[#0856DF] ring-1 ring-[#0856DF]/30"
                    : "border-slate-200"
                    } ${dragIdx === idx ? "opacity-40" : ""} ${overIdx === idx && dragIdx !== null && dragIdx !== idx
                      ? "border-[#0856DF] ring-1 ring-[#0856DF]/30"
                      : ""
                    }`}
                >
                  {/* Click thumbnail to zoom */}
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    aria-label="Zoom preview"
                    className="relative block aspect-square w-full overflow-hidden bg-slate-100"
                  >
                    <img
                      src={url}
                      alt={meta?.alt || "Product image preview"}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/50 text-white opacity-0 transition group-hover:opacity-100">
                      <ZoomIn size={13} />
                    </span>
                  </button>

                  {/* Top badges */}
                  <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
                    {isPrimary && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#0856DF] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                        <Star size={9} fill="currentColor" /> Primary
                      </span>
                    )}
                    {quality === "good" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 ring-1 ring-emerald-200">
                        <CheckCircle2 size={9} /> Good quality
                      </span>
                    )}
                    {quality === "low" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 ring-1 ring-amber-200">
                        Low resolution
                      </span>
                    )}
                    {quality === "very-low" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 ring-1 ring-red-200">
                        Very low resolution
                      </span>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    disabled={isSubmitting}
                    aria-label="Remove image"
                    className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>

                  {/* Controls: primary / move / drag */}
                  <div className="flex items-center justify-between gap-1 border-t border-slate-100 px-1 py-0.5">
                    {isPrimary ? (
                      <span className="inline-flex items-center gap-1 px-1 text-[10px] font-semibold text-[#0856DF]">
                        <Star size={10} fill="currentColor" /> Main image
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPrimary(idx)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-blue-50 hover:text-[#0856DF] disabled:opacity-50"
                      >
                        <Star size={10} /> Set Primary
                      </button>
                    )}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveImage(idx, Math.max(0, idx - 1))}
                        disabled={idx === 0 || isSubmitting}
                        aria-label="Move left"
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          moveImage(idx, Math.min(previewUrls.length - 1, idx + 1))
                        }
                        disabled={idx === previewUrls.length - 1 || isSubmitting}
                        aria-label="Move right"
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ChevronRight size={13} />
                      </button>
                      <span
                        title="Drag to reorder"
                        className="cursor-grab p-1 text-slate-300 active:cursor-grabbing"
                      >
                        <GripVertical size={13} />
                      </span>
                    </div>
                  </div>

                  {/* Alt text */}
                  <div className="border-t border-slate-100 p-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        Alt Text
                      </label>
                      {meta?.aiSuggested && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-indigo-500">
                          <Sparkles size={9} /> AI Suggested
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={meta?.alt || ""}
                        onChange={(e) => updateAlt(idx, e.target.value)}
                        disabled={isSubmitting}
                        placeholder="SEO alt text…"
                        className="w-full min-w-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 outline-none transition focus:border-[#0856DF]"
                      />
                      <button
                        type="button"
                        onClick={() => aiSuggestAlt(idx)}
                        disabled={isSubmitting || aiAltIndex !== null}
                        title="AI-suggest alt text"
                        className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 p-1 text-indigo-500 transition hover:bg-indigo-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {aiAltIndex === idx ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* AI Name & Description — analyzes the first newly selected image */}
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generatingFromImage ? () => aiAbortRef.current?.abort() : handleGenerateFromImage}
              disabled={(!images.some((f) => f) && !generatingFromImage) || isSubmitting}
              aria-label={generatingFromImage ? "Cancel AI generation" : "Generate product name and description from the first newly selected image"}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${generatingFromImage ? "bg-red-500 hover:bg-red-600" : "bg-[#0856DF] hover:bg-[#0645c8]"}`}
            >
              {generatingFromImage && <Loader2 size={12} className="animate-spin" />}
              {generatingFromImage ? `Cancel (${aiElapsed}s)` : "Generate Name & Description"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {generatingFromImage
              ? `Analyzing image... ${aiElapsed}s elapsed · this can take up to 60s`
              : "Uses the first new image · does not upload anything · first image = Primary"}
          </p>
        </div>
      </div>

      {/* Product Details Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Product Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="Enter product name"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Category
          </label>
          <select
            value={formData.category}
            onChange={(e) => {
              const newCategory = e.target.value;
              // Changing the category always resets the previously
              // selected subcategory — only the new category's
              // subcategories are shown below.
              setFormData((prev) => ({
                ...prev,
                category: newCategory,
                subcategory: "",
              }));
            }}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            disabled={isSubmitting}
          >
            <option value="">Select Category</option>
            {categories.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Subcategory
          </label>
          <select
            value={formData.subcategory}
            onChange={(e) =>
              setFormData({ ...formData, subcategory: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            disabled={isSubmitting || !formData.category}
          >
            <option value="">
              {formData.category ? "No subcategory" : "Select Category First"}
            </option>
            {formData.category &&
              subcategories
                .filter((sub) => {
                  const parent =
                    typeof sub.parentCategory === "object"
                      ? sub.parentCategory?._id
                      : sub.parentCategory;
                  return parent === formData.category;
                })
                .map((sub) => (
                  <option key={sub._id} value={sub._id}>
                    {sub.name}
                  </option>
                ))}
          </select>
          {formData.category &&
            subcategories.filter((sub) => {
              const parent =
                typeof sub.parentCategory === "object"
                  ? sub.parentCategory?._id
                  : sub.parentCategory;
              return parent === formData.category;
            }).length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">
                This category has no subcategories yet — subcategory is
                optional.
              </p>
            )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Price (Rs)
          </label>
          <input
            type="number"
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="0"
            disabled={isSubmitting || hasSizes || categoryUsesSizeBasedPricing || !categoriesLoaded}
          />
          {!categoriesLoaded && (
            <p className="mt-1 text-[10px] text-slate-400">Loading category settings…</p>
          )}
          {(hasSizes || categoryUsesSizeBasedPricing) && categoriesLoaded && (
            <p className="mt-1 text-[10px] text-slate-400">Disabled — using size-wise prices below</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Stock
          </label>
          <input
            type="number"
            value={formData.stock}
            onChange={(e) =>
              setFormData({ ...formData, stock: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="0"
            disabled={isSubmitting || hasSizes || categoryUsesSizeBasedPricing || !categoriesLoaded}
          />
          {!categoriesLoaded && (
            <p className="mt-1 text-[10px] text-slate-400">Loading category settings…</p>
          )}
          {(hasSizes || categoryUsesSizeBasedPricing) && categoriesLoaded && (
            <p className="mt-1 text-[10px] text-slate-400">Disabled — using size-wise stock below</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Brand Name
          </label>
          <input
            type="text"
            value={formData.brand}
            onChange={(e) =>
              setFormData({ ...formData, brand: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="0"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Customizable Section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.customizable}
            onChange={(e) =>
              setFormData({ ...formData, customizable: e.target.checked })
            }
            className="h-5 w-5 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]/30"
            disabled={isSubmitting}
          />
          <div>
            <span className="text-sm font-semibold text-slate-800">Customizable Product</span>
            <p className="text-xs text-slate-500">Allow customers to add custom text/photo to this product</p>
          </div>
        </label>

        {formData.customizable && (
          <div className="mt-3 pl-8 space-y-3">
            {/* Live preview toggle */}
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50">
              <input
                type="checkbox"
                checked={formData.showCustomizationPreview}
                onChange={(e) =>
                  setFormData({ ...formData, showCustomizationPreview: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]/30"
              />
              <div>
                <span className="text-sm font-semibold text-slate-800">Show live preview to customers</span>
                <p className="text-xs text-slate-500">When on, customers see a live preview of their name/logo on the product. When off, customers simply upload or type — no preview is shown.</p>
              </div>
            </label>
            {formData.customizationFields.map((field, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Field Type</label>
                    <select
                      value={field.fieldType}
                      onChange={(e) => {
                        const updated = [...formData.customizationFields];
                        updated[idx] = { ...updated[idx], fieldType: e.target.value };
                        if (e.target.value === "image" && !updated[idx].label.trim()) {
                          updated[idx] = { ...updated[idx], label: "Upload Your Design" };
                        }
                        if (e.target.value === "text" && !updated[idx].label.trim()) {
                          updated[idx] = { ...updated[idx], label: "Your Name" };
                        }
                        if (e.target.value === "textarea" && !updated[idx].label.trim()) {
                          updated[idx] = { ...updated[idx], label: "Describe Your Design" };
                        }
                        setFormData({ ...formData, customizationFields: updated });
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    >
                      <option value="text">Name (text)</option>
                      <option value="textarea">Design / Text (textarea)</option>
                      <option value="image">Photo Upload (image)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Label</label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => {
                        const updated = [...formData.customizationFields];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setFormData({ ...formData, customizationFields: updated });
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                      placeholder="e.g. Your Name"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => {
                        const updated = [...formData.customizationFields];
                        updated[idx] = { ...updated[idx], required: e.target.checked };
                        setFormData({ ...formData, customizationFields: updated });
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]/30"
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = formData.customizationFields.filter((_, i) => i !== idx);
                      setFormData({ ...formData, customizationFields: updated });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-600 hover:text-white"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const nextIndex = formData.customizationFields.length + 1;
                const defaultLabels: Record<string, string> = {
                  text: `Field ${nextIndex}`,
                  textarea: `Design ${nextIndex}`,
                  image: `Upload ${nextIndex}`,
                };
                const nextFieldType = "text";
                setFormData({
                  ...formData,
                  customizationFields: [
                    ...formData.customizationFields,
                    { fieldType: nextFieldType, label: defaultLabels[nextFieldType] || `Field ${nextIndex}`, required: false },
                  ],
                });
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#0856DF] hover:text-[#0856DF]"
            >
              Add Field
            </button>
          </div>
        )}

        {previewUrls.length > 0 && (
          <div className="mt-3 pl-8 space-y-3">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              {/* AI Print Layout — detected ONCE by Gemini Vision (admin side) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-700">AI Print Layout</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    Gemini detects the sample text already printed on the product photo
                    exactly once. Customer previews then render from this layout instantly —
                    no AI runs while they type.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnalyzeLayout}
                    disabled={analyzingLayout}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0856DF] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0645c8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {analyzingLayout && <Loader2 size={12} className="animate-spin" />}
                    {analyzingLayout
                      ? "Detecting…"
                      : formData.printLayout
                        ? "Re-detect Layout"
                        : "Detect Layout"}
                  </button>
                  {formData.printLayout && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, printLayout: null });
                        setLayoutStatus("idle");
                        setLayoutError("");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Persistent detection status — never silently fail */}
              {!analyzingLayout && layoutStatus === "detected" && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-200">
                  Layout detected
                </span>
              )}
              {!analyzingLayout && layoutStatus === "failed" && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 ring-1 ring-red-200">
                  Detection failed — click “Re-detect Layout” to retry
                </span>
              )}

              {formData.printLayout && (
                <div className="mt-2 rounded-lg bg-white p-2.5 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
                  {formData.printLayout.customizable === false ? (
                    <span className="font-medium text-amber-600">
                      No printable surface detected — this product may not be personalizable.
                    </span>
                  ) : formData.printLayout.textLayer ? (
                    <>
                      <ul className="space-y-0.5">
                        <li>
                          Sample text:{" "}
                          <b className="text-slate-800">{`"${formData.printLayout.sampleText || "—"}"`}</b>
                        </li>
                        <li>
                          Position: {Math.round((formData.printLayout.textLayer.x || 0) * 100)}%
                          , {Math.round((formData.printLayout.textLayer.y || 0) * 100)}% · Size:{" "}
                          {formData.printLayout.textLayer.fontSize ?? "—"}px · Rotation:{" "}
                          {formData.printLayout.textLayer.rotation || 0}°
                        </li>
                        <li>
                          Color: <span className="font-mono">{formData.printLayout.textLayer.color}</span> ·{" "}
                          Weight: {formData.printLayout.textLayer.fontWeight} · Align:{" "}
                          {formData.printLayout.textLayer.align}
                        </li>
                        {formData.printLayout.textLayers &&
                          formData.printLayout.textLayers.length > 1 && (
                            <li className="text-slate-500">
                              {formData.printLayout.textLayers.length} print regions detected
                            </li>
                          )}
                        {formData.printLayout.textLayer.isDefault && (
                          <li className="text-slate-500">
                            Blank product — using a centered default print area
                          </li>
                        )}
                      </ul>
                      {layoutError && (
                        <p className="mt-1.5 text-[10px] font-medium text-red-600">
                          {layoutError}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Shipping Section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.freeShipping}
            onChange={(e) =>
              setFormData({ ...formData, freeShipping: e.target.checked })
            }
            className="h-5 w-5 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]/30"
            disabled={isSubmitting}
          />
          <div>
            <span className="text-sm font-semibold text-slate-800">Free Shipping</span>
            <p className="text-xs text-slate-500">Enable to offer this product with free shipping</p>
          </div>
        </label>

        {!formData.freeShipping && (
          <div className="mt-3 pl-8">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Shipping Charge (Rs)
            </label>
            <input
              type="number"
              value={formData.shippingCharge}
              onChange={(e) =>
                setFormData({ ...formData, shippingCharge: e.target.value })
              }
              className="w-full max-w-xs rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
              placeholder="0"
              disabled={isSubmitting}
              min="0"
            />
          </div>
        )}
      </div>

      <div className="max-w-xl">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          className="w-full max-w-xl whitespace-pre-wrap break-words rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium leading-relaxed outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15 resize-none"
          rows={6}
        />
        <div className="mt-2">
          <AiGeneratorButton
            name={formData.name}
            context="product"
            onGenerate={(text) =>
              setFormData((prev) => ({ ...prev, description: text }))
            }
          />
        </div>
      </div>

      {/* Optional Fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Colors (comma-separated)
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {suggestedColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => addSuggestedValue("colors", c)}
                disabled={isSubmitting}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs transition hover:bg-slate-100"
              >
                {c}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={formData.colors}
            onChange={(e) =>
              setFormData({ ...formData, colors: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="Red, Blue, Green"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Sizes (comma-separated)
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {suggestedSizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSuggestedValue("sizes", s)}
                disabled={isSubmitting}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs transition hover:bg-slate-100"
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={formData.sizes}
            onChange={(e) =>
              setFormData({ ...formData, sizes: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="S, M, L, XL"
            disabled={isSubmitting}
          />
        </div>

        {/* ── Size Pricing & Stock Matrix ── */}
        {(() => {
          const sizeList = formData.sizes.split(",").map((s) => s.trim()).filter(Boolean);
          if (sizeList.length === 0) return null;
          // Size-only variant keys: color is independent, only size controls price & stock
          const variantKeys: string[] = [...sizeList];
          return (
            <div className="col-span-full">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Size Price & Stock (colors are independent — only size controls price and stock)
              </label>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Apply base price to ALL variants
                    const base = formData.price;
                    const updated: Record<string, string> = {};
                    for (const k of variantKeys) updated[k] = base;
                    setVariantPricing(updated);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Apply Base Price to All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Apply base stock to ALL variants
                    const base = formData.stock;
                    const updated: Record<string, string> = {};
                    for (const k of variantKeys) updated[k] = base;
                    setVariantStock(updated);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Apply Base Stock to All
                </button>
                <button
                  type="button"
                  onClick={() => { setVariantPricing({}); setVariantStock({}); }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Clear All
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2">Price (Rs)</th>
                      <th className="px-3 py-2">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantKeys.map((key) => (
                      <tr key={key} className="border-b border-slate-100">
                        <td className="px-3 py-1.5 text-sm font-medium text-slate-700 whitespace-nowrap">
                          {key}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={variantPricing[key] ?? ""}
                            onChange={(e) => {
                              setVariantPricing((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }));
                            }}
                            className="w-full max-w-[140px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none transition focus:border-[#0856DF] focus:ring-1 focus:ring-[#0856DF]/15"
                            placeholder=""
                            disabled={isSubmitting}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={variantStock[key] ?? ""}
                            onChange={(e) => {
                              setVariantStock((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }));
                            }}
                            className="w-full max-w-[100px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none transition focus:border-[#0856DF] focus:ring-1 focus:ring-[#0856DF]/15"
                            placeholder=""
                            disabled={isSubmitting}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Tags (comma-separated)
          </label>
          {/* Built-in SEO tags — derived live from the product name,
              brand, category and subcategory above. Clicking × removes
              a suggestion from the final list. */}
          {defaultSeoTags.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#0856DF]">
                Suggested SEO tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {defaultSeoTags.map((t) => {
                  const removed = removedDefaultTags.has(t.toLowerCase());
                  return (
                    <span
                      key={t}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${removed
                        ? "border-slate-200 bg-slate-50 text-slate-400 line-through"
                        : "border-[#0856DF]/25 bg-[#0856DF]/5 text-[#0856DF]"
                        }`}
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => {
                          setRemovedDefaultTags((prev) => {
                            const next = new Set(prev);
                            const key = t.toLowerCase();
                            if (removed) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                        disabled={isSubmitting}
                        aria-label={removed ? "Include in tags" : "Remove suggested tag"}
                        className="rounded-full p-0.5 transition hover:bg-[#0856DF]/10"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mb-2 flex flex-wrap gap-2">
            {suggestedTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addSuggestedValue("tags", t)}
                disabled={isSubmitting}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs transition hover:bg-slate-100"
              >
                {t}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={formData.tags}
            onChange={(e) =>
              setFormData({ ...formData, tags: e.target.value })
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
            placeholder="Trending, New, Sale"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* Real upload progress — images upload once, at submit */}
      {isSubmitting && uploadProgress !== null && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#0856DF]">
            <span className="inline-flex items-center gap-1.5">
              <Upload size={12} />
              {images.some((f) => f) && uploadProgress < 99
                ? "Uploading images…"
                : "Saving product…"}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-[#0856DF] transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-[#0856DF] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8] disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Saving..."
            : isEditMode
              ? "Update"
              : "Create"}
        </button>
      </div>

      {/* Image Preview Lightbox */}
      {portalHost && lightboxIndex !== null && previewUrls[lightboxIndex] &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 p-4"
            onClick={() => setLightboxIndex(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close preview"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/25"
            >
              <X size={20} />
            </button>

            {previewUrls.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((cur) =>
                    cur === null ? cur : (cur + previewUrls.length - 1) % previewUrls.length,
                  );
                }}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <img
              src={previewUrls[lightboxIndex]}
              alt={imageMeta[lightboxIndex]?.alt || "Product image preview"}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />

            {previewUrls.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((cur) => (cur === null ? cur : (cur + 1) % previewUrls.length));
                }}
                aria-label="Next image"
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25"
              >
                <ChevronRight size={22} />
              </button>
            )}

            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              {lightboxIndex + 1} / {previewUrls.length}
            </div>
          </div>,
          portalHost,
        )}

      {/* Oversized Image Rejection Modal */}
      {portalHost && oversizedImageModal &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <AlertCircle size={26} className="text-red-600" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-slate-900">Image Is Too Large</h3>
              <p className="mb-1 text-sm font-medium text-slate-500">
                <span className="font-bold text-slate-700">{oversizedImageModal.fileName}</span>
              </p>
              <p className="mb-4 text-sm text-slate-500">
                <span className="font-semibold text-red-600">{(oversizedImageModal.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                {' '}selected — maximum allowed is{' '}
                <span className="font-semibold text-slate-700">{(MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(0)} MB</span>
              </p>
              <p className="mb-5 text-xs text-slate-400">
                Please select a smaller image. The system auto-compresses large images, but this one exceeded the safety limit.
              </p>
              <button
                type="button"
                onClick={() => setOversizedImageModal(null)}
                className="w-full rounded-xl bg-[#0856DF] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
              >
                Got it
              </button>
            </div>
          </div>,
          portalHost,
        )}
    </form>
  );
};

export default ProductForm;
