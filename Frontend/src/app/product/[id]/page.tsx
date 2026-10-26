"use client";
import { formatPKR } from "@/app/utils/format";

import axios from "axios";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import useFetch, {
  baseUrl,
  getLocalCart,
  setLocalCart,
  showToast,
  cloudinaryUrl,
  getSizePriceRange,
  getEffectiveStock,
  getVariantStock,
  hasVariantInventory,
} from "../../utils/commonFunctions";
import { RootState } from "../../Redux/store";
import { openLogin } from "../../Redux/Features/modalSlice";
import { AnimatePresence, motion } from "framer-motion";
import { DUR_COMPONENT, EASE_STANDARD, panelSwap } from "../../utils/motion";
import { cartLineKey } from "../../utils/cartIdentity";
import {
  ArrowLeft,
  ShoppingCart,
  Tag,
  Star,
  CheckCircle,
  MessageCircle,
  Truck,
  Trash2,
  Upload,
  ArrowDown,
  Sparkles,
  AlertTriangle,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  X,
  Heart,
  Share2,
  Minus,
  Plus,
} from "lucide-react";

import RelatedProducts from "../../Components/RelatedProducts";
import { ReviewSection } from "../../Components/reviews";
import RecentlyViewed, { addToRecentlyViewed } from "../../Components/RecentlyViewed";
import LiveCustomPreview from "../../Components/LiveCustomPreview";
import {
  Badge,
  Button,
  ErrorState,
  SectionLabel,
  TextInput,
  fieldStyles,
} from "../../Components/ui";
import type { PrintLayout } from "../../utils/printLayout";
import {
  getFieldKey,
  sanitizePreviewText,
  validateImageFile,
  downscaleImageFile,
} from "../../utils/customizationPreview";

interface Review {
  user: {
    _id: string;
    username: string;
    email: string;
    profilePic?: string;
  };
  star: number;
  comment: string;
  reviewDate: string;
}

interface ProductDetail {
  _id: string;
  name: string;
  description: string;
  price: number;
  brand?: string;
  stock?: number;
  slug?: string;
  category?: {
    name: string;
  };
  subcategory?: {
    name: string;
  } | null;
  images?: Array<{ url: string }>;
  colors?: string[];
  sizes?: string[];
  averageRating?: number;
  totalReviews?: number;
  sold?: number;
  ratings?: Review[];
  shippingCharge?: number;
  customizable?: boolean;
  showCustomizationPreview?: boolean;
  customizationFields?: Array<{ fieldType: string; label: string; required: boolean }>;
  printLayout?: PrintLayout | null;
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
  freeShipping?: boolean;
}
interface ProductDetailApiResponse {
  status: number;
  message: string;
  data: ProductDetail;
}

const ProductDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const [productId, setProductId] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<"description" | "specifications" | "shipping" | "reviews">("description");

  const { data, loading, error, reFetch } = useFetch<ProductDetailApiResponse>(
    productId ? `${baseUrl}product/getProduct/${productId}` : "",
    { cacheKey: "product_detail", staleTime: 60 * 1000 },
  );
  const product = data?.data;

  const resolvedPrice = useMemo(() => {
    if (!product) return 0;
    const vp = product.variantPricing;
    if (vp && typeof vp === "object") {
      const colorSizeKey = selectedColor && selectedSize ? `${selectedColor}__${selectedSize}` : "";
      const sizeOnlyKey = selectedSize || "";
      if (colorSizeKey && vp[colorSizeKey] !== undefined) return vp[colorSizeKey];
      if (sizeOnlyKey && vp[sizeOnlyKey] !== undefined) return vp[sizeOnlyKey];
    }
    return product.price;
  }, [product, selectedColor, selectedSize]);

  const { minPrice: minSizePrice, maxPrice: maxSizePrice, hasRange } =
    getSizePriceRange(product?.variantPricing);
  const showPriceRange = hasRange && !selectedSize;

  const effectiveStock = useMemo(() => {
    if (!product) return 0;
    if (selectedSize) {
      return hasVariantInventory(product)
        ? getVariantStock(product, selectedColor, selectedSize)
        : getEffectiveStock(product);
    }
    return getEffectiveStock(product);
  }, [product, selectedColor, selectedSize]);

  const inStock = effectiveStock > 0;

  useEffect(() => {
    setSelectedColor("");
    setSelectedSize("");
    setQuantity(1);
  }, [product?._id]);

  useEffect(() => {
    if (params?.id) {
      setProductId(params.id as string);
    }
  }, [params]);

  const auth = useSelector((state: RootState) => state.auth);

  const handleChatAboutProduct = () => {
    if (!product?._id) return;
    if (!auth.username) {
      showToast("Please log in to chat about this product", "error");
      dispatch(openLogin());
      return;
    }
    router.push(`/chat?product=${product._id}`);
  };

  /* ── AI Live Custom Preview state ── */
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [customFiles, setCustomFiles] = useState<Record<string, File | null>>({});
  const [customPreviews, setCustomPreviews] = useState<Record<string, string>>({});
  const [customErrors, setCustomErrors] = useState<string[]>([]);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [removeBgFor, setRemoveBgFor] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCustomAnswers({});
    setCustomFiles({});
    setCustomPreviews({});
    setCustomErrors([]);
    setRemoveBgFor({});
  }, [product?._id]);

  const handleCustomChange = (key: string, value: string) => {
    setCustomAnswers((prev) => ({ ...prev, [key]: value }));
    setCustomErrors((prev) => prev.filter((e) => e !== key));
  };

  const handleCustomFileChange = async (key: string, file: File | null) => {
    if (file) {
      const check = validateImageFile(file);
      if (!check.ok) {
        showToast(check.error, "error");
        return;
      }
      const optimized = await downscaleImageFile(check.file);
      setCustomFiles((prev) => ({ ...prev, [key]: optimized }));
      setCustomPreviews((prev) => ({
        ...prev,
        [key]: URL.createObjectURL(optimized),
      }));
      setCustomAnswers((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setCustomFiles((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setCustomPreviews((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setCustomErrors((prev) => prev.filter((e) => e !== key));
  };

  const buildCustomizationAnswers = async (): Promise<
    Array<{ label: string; value: string }>
  > => {
    if (!product) return [];
    const answers: Array<{ label: string; value: string }> = [];
    for (const field of product.customizationFields || []) {
      const key = getFieldKey(field.fieldType, field.label);
      if (field.fieldType === "image") {
        const file = customFiles[key] || null;
        if (file) {
          if (!auth.username) {
            showToast("Please login to add a product with an uploaded image", "error");
            throw new Error("Login required for image customization");
          }
          setUploadingCustom(true);
          try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await axios.post(
              `${baseUrl}cart/upload-customization-image`,
              formData,
              { withCredentials: true },
            );
            answers.push({ label: field.label, value: res.data.data.url });
          } catch (err: any) {
            showToast(err?.response?.data?.message || "Failed to upload customization image", "error");
            throw err;
          } finally {
            setUploadingCustom(false);
          }
        }
      } else {
        const val = sanitizePreviewText(customAnswers[key] || "");
        if (val) answers.push({ label: field.label, value: val });
      }
    }
    setCustomErrors([]);
    return answers;
  };

  useEffect(() => {
    if (product) {
      addToRecentlyViewed({
        _id: product._id,
        name: product.name,
        price: product.price,
        slug: product.slug || product._id,
        image: product.images?.[0]?.url || "/carousel/Clothes.jpg",
      });
    }
  }, [product]);
  const [star, setStar] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const imageList = useMemo(
    () =>
      product?.images && product.images.length > 0
        ? product.images
        : [{ url: "/carousel/Clothes.jpg" }],
    [product],
  );

  const reviews = product?.ratings ?? [];

  const handleAddToCart = async () => {
    if (!product) return false;
    let customizationAnswers: Array<{ label: string; value: string }> = [];
    if (product.customizable && product.customizationFields?.length) {
      try {
        customizationAnswers = await buildCustomizationAnswers();
      } catch {
        return false;
      }
    }
    const payload: any = {
      productId: product._id,
      quantity,
    };
    if (selectedColor) payload.selectedColor = selectedColor;
    if (selectedSize) payload.selectedSize = selectedSize;
    if (customizationAnswers.length > 0) {
      payload.customizationAnswers = customizationAnswers;
    }
    if (auth.username) {
      try {
        await axios.post(`${baseUrl}cart`, payload, { withCredentials: true });
        window.dispatchEvent(new Event("cart-updated"));
        showToast(`${product.name} added to cart`, "success");
        return true;
      } catch (err: any) {
        console.error(err);
        showToast(err?.response?.data?.message || "Failed to add product to cart", "error");
        return false;
      }
    }
    const currentCart = getLocalCart() as Array<
      ProductDetail & {
        quantity: number;
        customizationAnswers?: Array<{ label: string; value: string }>;
      }
    >;
    // Match on product + variant + CUSTOMIZATION identity so adding the same
    // product again with different customization creates its own line instead
    // of silently overwriting the first line's answers.
    const incomingLine = {
      productId: product._id,
      selectedColor: selectedColor || "",
      selectedSize: selectedSize || "",
      customizationAnswers,
    };
    const existing = currentCart.find(
      (item) =>
        cartLineKey({
          productId: item._id,
          customizationAnswers: (item as any).customizationAnswers,
        }) === cartLineKey(incomingLine),
    );
    if (existing) {
      existing.quantity += quantity;
      if (customizationAnswers.length > 0) {
        existing.customizationAnswers = customizationAnswers;
      }
    } else {
      currentCart.push({
        ...product,
        price: resolvedPrice,
        quantity,
        selectedColor: selectedColor || "",
        selectedSize: selectedSize || "",
        ...(customizationAnswers.length > 0
          ? { customizationAnswers }
          : {}),
      } as any);
    }
    setLocalCart(currentCart);
    showToast(`${product.name} added to cart`, "success");
    return true;
  };

  const handleBuyNow = async () => {
    if (isBuyingNow) return;
    setIsBuyingNow(true);
    try {
      const added = await handleAddToCart();
      if (added) {
        router.push("/checkout");
      }
    } finally {
      setIsBuyingNow(false);
    }
  };

  const handleAddToCartAndGo = async () => {
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    try {
      const added = await handleAddToCart();
      if (added) {
        router.push("/cart");
      }
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!star) return showToast("Please select a star rating", "error");
    if (!productId) return;
    setSubmitting(true);
    try {
      await axios.put(
        `${baseUrl}product/productRatings/${productId}`,
        { star, comment },
        { withCredentials: true },
      );
      showToast("Rating submitted successfully!", "success");
      setSubmitted(true);
      setStar(0);
      setComment("");
      reFetch();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to submit rating", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!productId) return;
    if (!window.confirm("Are you sure you want to delete your review? This cannot be undone.")) {
      return;
    }
    try {
      await axios.delete(
        `${baseUrl}product/getProduct/${productId}/rating`,
        { withCredentials: true },
      );
      showToast("Review deleted successfully", "success");
      reFetch();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to delete review", "error");
    }
  };

  const prevImage = () => {
    setCurrentImageIndex(
      (prev) => (prev - 1 + imageList.length) % imageList.length,
    );
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);
  };

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="Image zoom view"]',
    ) as HTMLElement | null;
    dialog?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [lightboxIndex]);

  useEffect(() => {
    setCurrentImageIndex(0);
    setLightboxIndex(null);
  }, [product?.images]);

  /* ── Mobile sticky purchase bar ──
     The bar appears only once the in-page CTA has scrolled out of view. One
     boolean flips per threshold crossing — no rAF, no timers, no per-frame
     state, so it cannot cause continuous re-renders. If IntersectionObserver
     is unavailable the bar simply stays visible (the safe default). */
  const ctaAnchorRef = useRef<HTMLDivElement | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  useEffect(() => {
    const node = ctaAnchorRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShowStickyBar(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [product?._id, loading]);

  /* Presentation-only summary of the required customization fields — which are
     filled and which are still empty. The add-to-cart path, its validation and
     the payload are untouched; this only drives the status line in the panel. */
  const requiredCustomizationFields = (product?.customizationFields ?? []).filter(
    (f) => f.required,
  );
  const missingRequiredCustomization = requiredCustomizationFields.filter((f) => {
    const key = getFieldKey(f.fieldType, f.label);
    return f.fieldType === "image" ? !customFiles[key] : !(customAnswers[key] || "").trim();
  }).length;

  return (
    <main className="min-h-screen bg-surface-page text-ink">
      {/* SEO: JSON-LD structured data for product pages */}
      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: product.name,
              description: product.description,
              image: product.images?.map((img: any) => img.url),
              brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
              sku: product.slug || product._id,
              offers: {
                "@type": "Offer",
                priceCurrency: "PKR",
                price: resolvedPrice,
                availability: (product.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                url: `${typeof window !== "undefined" ? window.location.origin : "https://irhasinn.vercel.app"}/product/${product.slug || product._id}`,
              },
              aggregateRating: product.averageRating ? {
                "@type": "AggregateRating",
                ratingValue: product.averageRating,
                reviewCount: product.totalReviews || 0,
              } : undefined,
            }),
          }}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pb-14 sm:pt-6">
        {/* Breadcrumb — ClientLayout already renders the storefront Navbar on
            this route, so the page must not render a second one. The previous
            duplicate header had an empty onClick on its search button, inert
            wishlist/account buttons and a cart badge hardcoded to "0". */}
        <nav
          className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted sm:text-sm"
          aria-label="Breadcrumb"
        >
          <button
            type="button"
            onClick={() => router.push("/")}
            className="transition-colors hover:text-brand-gold-hover"
          >
            Home
          </button>
          <span aria-hidden className="text-ink-subtle">
            /
          </span>
          {product && (
            <>
              {product.category?.name && (
                <>
                  <span className="truncate">{product.category.name}</span>
                  <span aria-hidden className="text-ink-subtle">
                    /
                  </span>
                </>
              )}
              {product.subcategory?.name && (
                <>
                  <span className="truncate">{product.subcategory.name}</span>
                  <span aria-hidden className="text-ink-subtle">
                    /
                  </span>
                </>
              )}
              <span className="max-w-[200px] truncate font-semibold text-brand-navy sm:max-w-none">
                {product.name}
              </span>
            </>
          )}
        </nav>

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10">
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="aspect-square animate-pulse rounded-field bg-surface-muted" />
              <div className="mt-3 flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 w-16 animate-pulse rounded-field bg-surface-muted" />
                ))}
              </div>
            </div>
            <div className="space-y-4 rounded-card border border-line bg-surface p-6 shadow-card">
              <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
              <div className="h-7 w-3/4 animate-pulse rounded bg-surface-muted" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-surface-muted" />
              <div className="h-8 w-1/4 animate-pulse rounded bg-surface-muted" />
              <div className="flex gap-3 pt-4">
                <div className="h-12 flex-1 animate-pulse rounded-field bg-surface-muted" />
                <div className="h-12 flex-1 animate-pulse rounded-field bg-surface-muted" />
              </div>
            </div>
          </div>
        ) : error || !product ? (
          /* Surface the real failure and let the customer retry with the
             existing useFetch refetch — no fallback data, no silent empty state. */
          <ErrorState
            title="We couldn't load this product"
            message="The product service didn't respond. Check your connection and try again — nothing in your cart was changed."
            onRetry={reFetch}
          />
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10"
            >
              {/* LEFT: Image gallery */}
              <div className="min-w-0 space-y-4 rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {/* Thumbnails — role="group" rather than role="list", which
                      would require listitem children. */}
                  <div
                    className="flex flex-row items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-20 sm:flex-shrink-0 sm:flex-col sm:items-center sm:overflow-visible sm:pb-0"
                    role="group"
                    aria-label="Product images"
                  >
                    {imageList.map((image, imgIndex) => (
                      <button
                        key={`thumb-${image.url}-${imgIndex}`}
                        type="button"
                        onClick={() => setCurrentImageIndex(imgIndex)}
                        aria-label={`View image ${imgIndex + 1} of ${imageList.length}`}
                        aria-current={imgIndex === currentImageIndex ? "true" : "false"}
                        className={`relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-field transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold sm:h-[72px] sm:w-[72px] ${
                          imgIndex === currentImageIndex
                            ? "ring-2 ring-brand-gold opacity-100"
                            : "ring-1 ring-line opacity-60 hover:opacity-100"
                        }`}
                      >
                        <Image
                          src={cloudinaryUrl(image.url, 300) || image.url}
                          alt={`${product.name} thumbnail ${imgIndex + 1}`}
                          width={300}
                          height={300}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>

                  {/* Main image */}
                  <div className="relative flex-1 overflow-hidden rounded-field bg-surface-muted sm:rounded-card">
                    <div
                      className="relative w-full overflow-hidden"
                      role="group"
                      aria-label="Product image viewer"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") { e.preventDefault(); prevImage(); }
                        if (e.key === "ArrowRight") { e.preventDefault(); nextImage(); }
                      }}
                    >
                      <div className="relative aspect-square w-full md:aspect-[4/5]">
                        {imageList.map((image, imgIndex) => (
                          <Image
                            key={`${image.url}-${imgIndex}`}
                            src={cloudinaryUrl(image.url, 1200) || image.url}
                            alt={`${product.name} ${imgIndex + 1}`}
                            width={1200}
                            height={1200}
                            priority={imgIndex === 0}
                            decoding="async"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 55vw"
                            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ease-out ${
                              imgIndex === currentImageIndex ? "opacity-100" : "opacity-0"
                            }`}
                          />
                        ))}
                        {/* Zoom button — 44px touch target */}
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(currentImageIndex)}
                          className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-brand-navy shadow-card transition-[transform,background-color] hover:scale-105 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                          aria-label="Zoom image"
                        >
                          <ZoomIn size={18} />
                        </button>
                        {/* Position indicator — the thumbnails scroll horizontally
                            on mobile, so the counter is the only reliable cue. */}
                        {imageList.length > 1 && (
                          <span
                            aria-hidden
                            className="absolute bottom-3 left-3 z-10 rounded-full bg-brand-navy/75 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white sm:hidden"
                          >
                            {currentImageIndex + 1} / {imageList.length}
                          </span>
                        )}
                        {/* Nav arrows — only meaningful with more than one image */}
                        {imageList.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={prevImage}
                              className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-brand-navy shadow-card transition-[transform,background-color] hover:scale-105 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                              aria-label="Previous image"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <button
                              type="button"
                              onClick={nextImage}
                              className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-brand-navy shadow-card transition-[transform,background-color] hover:scale-105 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                              aria-label="Next image"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: Product info */}
              <div className="min-w-0 space-y-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
                {/* Category / brand / shipping meta */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="navy" size="sm">
                    {product.category?.name ?? "General"}
                  </Badge>
                  {product.subcategory?.name && (
                    <Badge tone="neutral" size="sm">
                      {product.subcategory.name}
                    </Badge>
                  )}
                  <Badge tone="neutral" size="sm" icon={<Tag size={11} aria-hidden />}>
                    {product.brand ?? "Irhas'Inn"}
                  </Badge>
                  {product.freeShipping && (
                    <Badge tone="success" size="sm" icon={<Truck size={11} aria-hidden />}>
                      Free Shipping
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-xl font-black leading-tight tracking-tight text-brand-navy sm:text-2xl md:text-3xl">
                  {product.name}
                </h1>

                {/* Rating + meta row — real values only; no synthesized rating. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1">
                    <Star size={15} aria-hidden className="fill-brand-gold text-brand-gold" />
                    <span className="font-bold text-brand-navy">
                      {product.averageRating?.toFixed(1) ?? "0.0"}
                    </span>
                    <span className="text-ink-muted">
                      ({reviews.length} {reviews.length === 1 ? "review" : "reviews"})
                    </span>
                  </span>
                  <span aria-hidden className="text-ink-subtle">
                    ·
                  </span>
                  <span className="text-ink-muted">{product.sold ?? 0} sold</span>
                  <span aria-hidden className="text-ink-subtle">
                    ·
                  </span>
                  <span className="font-mono text-[10px] text-ink-subtle">
                    SKU: {product.slug || product._id.slice(-8)}
                  </span>
                </div>

                {/* Price — the size-wise range is real variant data, never a
                    synthetic "was/now" pair. */}
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <p className="text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
                    {showPriceRange
                      ? `${formatPKR(minSizePrice)} - ${formatPKR(maxSizePrice)}`
                      : `${formatPKR(resolvedPrice)}`}
                  </p>
                  {showPriceRange && (
                    <span className="pb-1 text-xs font-semibold text-ink-muted">
                      Depends on the size you choose
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-ink-muted">
                  {product.description}
                </p>

                {/* Stock status */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={inStock ? "success" : "danger"} size="sm" dot>
                    {inStock ? "In Stock" : "Out of Stock"}
                  </Badge>
                  {inStock && (
                    <span className="text-xs text-ink-muted">
                      {product.customizable ? "Available for customization" : "Ready to ship"}
                    </span>
                  )}
                </div>

                {/* Color selection — native buttons exposed as a radio group, so
                    keyboard and screen-reader behaviour matches the visual one. */}
                {product.colors && product.colors.length > 0 && (
                  <div className="space-y-2">
                    <p
                      id="pdp-color-label"
                      className="text-xs font-bold uppercase tracking-wider text-ink-muted"
                    >
                      Color{selectedColor ? `: ${selectedColor}` : ""}
                    </p>
                    <div
                      role="radiogroup"
                      aria-labelledby="pdp-color-label"
                      className="flex flex-wrap gap-2"
                    >
                      {product.colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={selectedColor === color}
                          onClick={() => setSelectedColor(selectedColor === color ? "" : color)}
                          className={`min-h-[44px] rounded-field border px-4 text-sm font-semibold transition-[border-color,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold ${
                            selectedColor === color
                              ? "border-brand-gold bg-brand-gold text-brand-navy-deep shadow-sm"
                              : "border-line bg-surface text-brand-navy hover:border-brand-gold/60 hover:bg-brand-gold/[0.06]"
                          }`}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Size selection */}
                {product.sizes && product.sizes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p
                        id="pdp-size-label"
                        className="text-xs font-bold uppercase tracking-wider text-ink-muted"
                      >
                        Size{selectedSize ? `: ${selectedSize}` : ""}
                      </p>
                      {!selectedSize && (
                        <span className="text-[11px] font-semibold text-state-warning">
                          Select a size{showPriceRange ? " to see its price" : ""}
                        </span>
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-labelledby="pdp-size-label"
                      className="flex flex-wrap gap-2"
                    >
                      {product.sizes.map((size) => {
                        const sizeStock = hasVariantInventory(product)
                          ? getVariantStock(product, selectedColor, size)
                          : getEffectiveStock(product);
                        const sizeAvailable = sizeStock > 0;
                        return (
                          <motion.button
                            key={size}
                            type="button"
                            role="radio"
                            aria-checked={selectedSize === size}
                            onClick={() => sizeAvailable && setSelectedSize(selectedSize === size ? "" : size)}
                            disabled={!sizeAvailable}
                            whileTap={sizeAvailable ? { scale: 0.95 } : undefined}
                            transition={{ duration: 0.15, ease: EASE_STANDARD }}
                            className={`min-h-[44px] rounded-field border px-4 text-sm font-semibold transition-[border-color,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold ${
                              selectedSize === size
                                ? "border-brand-gold bg-brand-gold text-brand-navy-deep shadow-sm"
                                : sizeAvailable
                                  ? "border-line bg-surface text-brand-navy hover:border-brand-gold/60 hover:bg-brand-gold/[0.06]"
                                  : "cursor-not-allowed border-line bg-surface-muted text-ink-subtle line-through"
                            }`}
                          >
                            {size}
                            {!sizeAvailable && <span className="sr-only"> (out of stock)</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Customization pointer — this used to be a partial duplicate
                    that rendered only the FIRST text field (`filter + slice(0,1)`)
                    with no required markers and no upload, competing with the
                    real customization panel further down the page. Now it states
                    the requirement and links to the single complete panel. */}
                {product.customizable &&
                  (product.customizationFields?.length ?? 0) > 0 && (
                    <div className="rounded-card border border-brand-gold/30 bg-brand-gold/[0.06] p-4">
                      <div className="flex items-start gap-3">
                        <Sparkles
                          size={16}
                          aria-hidden
                          className="mt-0.5 shrink-0 text-brand-gold-hover"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-brand-navy">
                            Made to order — customize it
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                            {(() => {
                              const fields = product.customizationFields ?? [];
                              const requiredCount = fields.filter((f) => f.required).length;
                              return requiredCount > 0
                                ? `${requiredCount} of ${fields.length} ${
                                    fields.length === 1 ? "detail is" : "details are"
                                  } required.`
                                : `${fields.length} optional ${
                                    fields.length === 1 ? "detail" : "details"
                                  }.`;
                            })()}{" "}
                            Set them in the customization panel below, then add to cart.
                          </p>
                          <a
                            href="#customize"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-gold-hover underline-offset-4 hover:underline"
                          >
                            Go to customization
                            <ArrowDown size={13} aria-hidden />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Quantity stepper — behaviour unchanged (no stock clamping),
                    44px targets for touch. */}
                <div className="space-y-2">
                  <p
                    id="pdp-qty-label"
                    className="text-xs font-bold uppercase tracking-wider text-ink-muted"
                  >
                    Quantity
                  </p>
                  <div
                    role="group"
                    aria-labelledby="pdp-qty-label"
                    className="inline-flex items-center rounded-field border border-line bg-surface"
                  >
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-l-field text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={15} />
                    </button>
                    <span
                      aria-live="polite"
                      className="flex h-11 w-14 items-center justify-center border-x border-line text-sm font-bold tabular-nums text-brand-navy"
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-r-field text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                      aria-label="Increase quantity"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                {/* Primary CTAs — handlers, payload and disabled logic unchanged.
                    This element is also the anchor the mobile sticky bar watches,
                    so the bar appears exactly when these buttons scroll away. */}
                <div ref={ctaAnchorRef} className="grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="gold"
                    size="lg"
                    fullWidth
                    loading={isAddingToCart}
                    icon={<ShoppingCart size={16} aria-hidden />}
                    onClick={handleAddToCartAndGo}
                  >
                    {isAddingToCart ? "Adding..." : "ADD TO CART"}
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={isBuyingNow}
                    onClick={handleBuyNow}
                  >
                    {isBuyingNow ? "Processing..." : "BUY NOW"}
                  </Button>
                </div>

                {/* Small action links — behaviour untouched (the wishlist action
                    is still a toast-only stub; it is not wired to any API). */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-muted">
                  <button
                    type="button"
                    onClick={() => showToast("Added to wishlist", "success")}
                    className="inline-flex min-h-[32px] items-center gap-1.5 transition-colors hover:text-brand-gold-hover"
                  >
                    <Heart size={14} aria-hidden /> Add to Wishlist
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      showToast("Link copied!", "info");
                    }}
                    className="inline-flex min-h-[32px] items-center gap-1.5 transition-colors hover:text-brand-gold-hover"
                  >
                    <Share2 size={14} aria-hidden /> Share Product
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Customization panel — moved ABOVE the tabs so the required details
                sit directly after the buy column instead of below the fold. Field
                types, the upload flow, LiveCustomPreview and the
                printLayout / showCustomizationPreview fallbacks are unchanged. */}
            {product?.customizable && product.customizationFields && product.customizationFields.length > 0 && (
              <div
                id="customize"
                className="mt-6 scroll-mt-24 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
              >
                <SectionLabel>Make It Yours</SectionLabel>
                <p className="mb-4 mt-1 text-xs text-ink-muted">
                  Personalize this product — the preview updates as you type.
                </p>

                {/* Presentation-only status: reports which required fields are
                    still empty. It never blocks the add-to-cart action. */}
                {requiredCustomizationFields.length > 0 && (
                  <div
                    className={`mb-4 flex items-start gap-2 rounded-field border p-3 text-xs font-semibold ${
                      missingRequiredCustomization === 0
                        ? "border-state-success/25 bg-state-success/[0.06] text-state-success"
                        : "border-state-warning/30 bg-state-warning/[0.06] text-state-warning"
                    }`}
                  >
                    {missingRequiredCustomization === 0 ? (
                      <CheckCircle size={15} aria-hidden className="mt-px shrink-0" />
                    ) : (
                      <AlertTriangle size={15} aria-hidden className="mt-px shrink-0" />
                    )}
                    <span>
                      {missingRequiredCustomization === 0
                        ? `All ${requiredCustomizationFields.length} required ${
                            requiredCustomizationFields.length === 1 ? "detail is" : "details are"
                          } filled in.`
                        : `${missingRequiredCustomization} of ${requiredCustomizationFields.length} required ${
                            requiredCustomizationFields.length === 1 ? "detail" : "details"
                          } still ${missingRequiredCustomization === 1 ? "needs" : "need"} your input.`}
                    </span>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {(product.showCustomizationPreview ?? true) ? (
                    product.printLayout ? (
                      <LiveCustomPreview
                        productImage={imageList[0]?.url}
                        fields={product.customizationFields}
                        answers={customAnswers}
                        images={customPreviews}
                        printLayout={product.printLayout}
                        showEmptyHint
                        removeBackground={removeBgFor}
                      />
                    ) : (
                      <div className="relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-card border border-line bg-surface-muted">
                        <Image src={imageList[0]?.url || "/carousel/Clothes.jpg"} alt={product.name} width={600} height={600} className="absolute inset-0 h-full w-full object-contain opacity-70" />
                        <div className="relative z-10 rounded-field bg-surface/90 px-4 py-2.5 text-center shadow-card backdrop-blur-sm">
                          <p className="text-xs font-semibold text-ink-muted">Preview coming soon</p>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-card border border-line bg-surface-muted">
                      <Image src={imageList[0]?.url || "/carousel/Clothes.jpg"} alt={product.name} width={600} height={600} className="absolute inset-0 h-full w-full object-contain" />
                    </div>
                  )}
                  <div className="space-y-4">
                    {product.customizationFields.map((field) => {
                      const key = getFieldKey(field.fieldType, field.label);
                      const value = customAnswers[key] || "";
                      const file = customFiles[key] || null;
                      const preview = customPreviews[key] || "";
                      const fieldId = `cust-${key}`;
                      return (
                        <div key={key}>
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                            <label
                              htmlFor={fieldId}
                              className="text-[13px] font-semibold text-brand-navy"
                            >
                              {field.label}
                              {field.required && (
                                <span className="ml-0.5 text-state-danger" aria-hidden>
                                  *
                                </span>
                              )}
                            </label>
                            <Badge tone={field.required ? "warning" : "neutral"} size="sm">
                              {field.required ? "Required" : "Optional"}
                            </Badge>
                          </div>
                          {field.fieldType === "text" && (
                            <>
                              <TextInput
                                id={fieldId}
                                type="text"
                                value={value}
                                onChange={(e) => handleCustomChange(key, e.target.value)}
                                placeholder={field.label}
                                maxLength={200}
                              />
                              <p className="mt-1 text-right text-[10px] text-ink-subtle">
                                {value.length}/200
                              </p>
                            </>
                          )}
                          {field.fieldType === "textarea" && (
                            <textarea
                              id={fieldId}
                              value={value}
                              onChange={(e) => handleCustomChange(key, e.target.value)}
                              rows={3}
                              maxLength={200}
                              placeholder={field.label}
                              className={fieldStyles({ className: "h-24 resize-none py-3" })}
                            />
                          )}
                          {field.fieldType === "image" && (
                            <div>
                              <label
                                htmlFor={fieldId}
                                className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-field border-2 border-dashed border-line bg-surface-muted px-3 py-2.5 text-xs font-semibold text-ink-muted transition-colors hover:border-brand-gold hover:bg-brand-gold/[0.06] focus-within:ring-2 focus-within:ring-brand-gold"
                              >
                                <Upload size={14} aria-hidden />
                                <span>{file ? "Change Image" : "Choose Image"}</span>
                                <input
                                  id={fieldId}
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  onChange={(e) => handleCustomFileChange(key, e.target.files?.[0] || null)}
                                  className="sr-only"
                                />
                              </label>
                              {preview && (
                                <div className="mt-2 inline-flex items-center gap-2.5 rounded-field border border-line bg-surface p-1.5 pl-2">
                                  {/* Blob URL from URL.createObjectURL — next/image
                                      cannot optimise an object URL. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={preview}
                                    alt={`${field.label} preview`}
                                    className="h-10 w-10 rounded-field object-cover ring-1 ring-line"
                                  />
                                  <span className="text-[11px] font-semibold text-ink-muted">
                                    Uploaded
                                  </span>
                                  {/* Previously labelled "Change", but it
                                      actually cleared the file — the wrapping
                                      dropzone above is what re-opens the picker. */}
                                  <button
                                    type="button"
                                    onClick={() => handleCustomFileChange(key, null)}
                                    className="text-[11px] font-bold text-brand-gold-hover hover:underline"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-ink-subtle">PNG, JPG, or WebP — up to 5 MB.</p>
                    {uploadingCustom && (
                      <p className="text-[11px] font-semibold text-brand-gold-hover">
                        Uploading your image…
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Image lightbox */}
            {lightboxIndex !== null && (
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy-deep/95 p-4 outline-none sm:p-8"
                onClick={() => setLightboxIndex(null)}
                role="dialog"
                aria-modal="true"
                aria-label="Image zoom view"
                tabIndex={-1}
              >
                <button type="button" onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25" aria-label="Close zoom view">
                  <X size={22} />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); prevImage(); }} className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:left-6" aria-label="Previous image">
                  <ChevronLeft size={24} />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); nextImage(); }} className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:right-6" aria-label="Next image">
                  <ChevronRight size={24} />
                </button>
                <Image
                  src={imageList[lightboxIndex]?.url || "/carousel/Clothes.jpg"}
                  alt={`${product.name} zoomed image`}
                  width={1200}
                  height={1200}
                  className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Mobile sticky purchase bar — appears once the in-page CTA has
                scrolled out of view. Sits above MobileBottomNav (h-14) and
                reserves its own space at the end of the page so it can never
                cover the last content block. */}
            {showStickyBar && (
              <>
                <div
                  className="fixed bottom-14 left-0 right-0 z-40 border-t border-line bg-surface/95 shadow-[0_-4px_20px_rgba(34,40,49,0.08)] backdrop-blur-xl md:hidden"
                  style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-field bg-surface-muted ring-1 ring-line">
                      <Image
                        src={
                          cloudinaryUrl(imageList[currentImageIndex]?.url, 200) ||
                          imageList[currentImageIndex]?.url ||
                          "/carousel/Clothes.jpg"
                        }
                        alt=""
                        width={88}
                        height={88}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[11px] font-semibold ${
                          product.sizes && product.sizes.length > 0 && !selectedSize
                            ? "text-state-warning"
                            : "text-ink-muted"
                        }`}
                      >
                        {product.sizes && product.sizes.length > 0
                          ? selectedSize
                            ? `Size: ${selectedSize}`
                            : "Select a size"
                          : product.customizable
                            ? "Customizable"
                            : "Ready to ship"}
                      </p>
                      <p className="truncate text-base font-black leading-tight text-brand-navy">
                        {showPriceRange
                          ? `From ${formatPKR(minSizePrice)}`
                          : `${formatPKR(resolvedPrice)}`}
                      </p>
                    </div>
                    <Button
                      variant="gold"
                      size="md"
                      loading={isAddingToCart}
                      icon={<ShoppingCart size={16} aria-hidden />}
                      onClick={handleAddToCartAndGo}
                    >
                      {isAddingToCart ? "Adding..." : "Add to Cart"}
                    </Button>
                  </div>
                </div>
                {/* Spacer so the fixed bar never overlaps the last block. */}
                <div aria-hidden className="h-20 md:hidden" />
              </>
            )}

            {/* Tabs section — tabs scroll horizontally at 320px instead of
                being squeezed into four 80px cells. */}
            <div className="mt-8 overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <div
                role="tablist"
                aria-label="Product information"
                className="flex overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {(["description", "specifications", "shipping", "reviews"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`pdp-tab-${tab}`}
                    aria-selected={activeTab === tab}
                    aria-controls="pdp-tabpanel"
                    onClick={() => setActiveTab(tab)}
                    className={`relative shrink-0 whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-gold sm:px-5 sm:text-sm ${
                      activeTab === tab
                        ? "text-brand-navy"
                        : "text-ink-subtle hover:text-ink-muted"
                    }`}
                  >
                    {tab === "reviews" ? `Reviews (${reviews.length})` : tab}
                    {activeTab === tab && (
                      /* `layoutId` slides the existing underline to the newly
                         active tab instead of snapping to a new one. */
                      <motion.span
                        layoutId="pdp-tab-underline"
                        transition={{ duration: DUR_COMPONENT, ease: EASE_STANDARD }}
                        className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-gold"
                      />
                    )}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id="pdp-tabpanel"
                aria-labelledby={`pdp-tab-${activeTab}`}
                className="p-5 sm:p-6"
              >
                {/* `initial={false}` keeps the first paint instant; only real
                    tab switches animate, and the swap waits for the exit so
                    the two panels never overlap. */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeTab}
                    variants={panelSwap}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                {activeTab === "description" && (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-ink-muted">{product.description}</p>
                )}
                {activeTab === "specifications" && (
                  <div className="space-y-2 text-sm text-ink-muted">
                    {product.brand && <div className="flex gap-2"><span className="w-28 font-semibold text-brand-navy">Brand</span><span>{product.brand}</span></div>}
                    {product.colors && product.colors.length > 0 && <div className="flex gap-2"><span className="w-28 font-semibold text-brand-navy">Colors</span><span>{product.colors.join(", ")}</span></div>}
                    {product.sizes && product.sizes.length > 0 && <div className="flex gap-2"><span className="w-28 font-semibold text-brand-navy">Sizes</span><span>{product.sizes.join(", ")}</span></div>}
                  </div>
                )}
                {activeTab === "shipping" && (
                  <div className="space-y-2 text-sm text-ink-muted">
                    <p>{product.freeShipping ? "✓ Free shipping on this product" : "Standard shipping rates apply"}</p>
                    <p>Estimated delivery: 3-5 business days</p>
                  </div>
                )}
                {activeTab === "reviews" && (
                  <ReviewSection
                    productId={productId || ""}
                    currentUserId={auth._id}
                    isAuthenticated={!!auth.username}
                  />
                )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Recently Viewed */}
            <div className="mt-6">
              <RecentlyViewed excludeId={product?._id} />
            </div>

            {/* Related Products */}
            {product && (
              <div className="mt-6">
                <RelatedProducts productId={product._id} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default ProductDetailPage;
