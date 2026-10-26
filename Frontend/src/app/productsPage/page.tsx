"use client";
import { formatPKR } from "@/app/utils/format";

import React, { memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";
import {
  getLocalCart,
  setLocalCart,
  showToast,
} from "../utils/commonFunctions";
import axios from "axios";
import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";

import Contact from "../Components/Contact";
import useFetch, { baseUrl, cloudinaryUrl, getSizePriceRange, getEffectiveStock } from "../utils/commonFunctions";

interface Product {
  _id: string;
  name: string;
  price: number;
  description: string;
  images?: Array<{ url: string }>;
  slug: string;
}

/** Full product shape returned by /getAllProducts (populated category/subcategory). */
interface ProductData extends Product {
  brand?: string;
  stock?: number;
  colors?: string[];
  sizes?: string[];
  averageRating?: number;
  totalReviews?: number;
  tags?: string[];
  createdAt?: string;
  category?: { _id?: string; name?: string; slug?: string };
  subcategory?: { _id?: string; name?: string; slug?: string } | null;
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
  freeShipping?: boolean;
}

interface ProductsPageProps {
  title?: string;
}

interface CategoryData {
  _id: string;
  name: string;
  slug?: string;
  image?: string;
}

/* ── Brand helpers ─────────────────────────────────────────────── */

const NAVY = "#222831";
const GOLD = "#C8A84E";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
};

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "rating", label: "Highest Rated" },
] as const;
type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const RATING_OPTIONS = [
  { value: 4, label: "4 & up" },
  { value: 3, label: "3 & up" },
] as const;

/** Products fetched per server page (2/3-column grid friendly). */
const PAGE_SIZE = 24;

/** Page-number window: 1 … 3 4 5 … 12 (ellipsis for gaps). */
const getPageNumbers = (current: number, total: number): Array<number | "ellipsis"> => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(wanted)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  let prev = 0;
  sorted.forEach((p) => {
    if (p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  });
  return out;
};

/* ── Product card image carousel ──────────────────────────────────
   UPDATED: square aspect-ratio container, full image always visible
   (object-contain instead of the old fixed-height cropped box), and
   the slide-swap is now driven by framer-motion's AnimatePresence for
   a real cross-fade + gentle scale transition on every image change
   (auto-rotate or hover), instead of the old CSS opacity-stack. */
const ProductCardImageCarousel: React.FC<{
  images?: Array<{ url: string }>;
  label: string;
}> = ({ images, label }) => {
  const normalizedImages = useMemo(
    () => (images && images.length > 0 ? images : [{ url: "/carousel/Clothes.jpg" }]),
    [images],
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [normalizedImages]);

  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (normalizedImages.length <= 1) return;
    // Only run the auto-rotation timer while this card is actually on screen.
    // A grid of 24+ cards used to run 24+ perpetual setIntervals that kept
    // firing (and re-rendering) even after the cards scrolled out of view.
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let interval: number | null = null;
    const start = () => {
      if (interval) return;
      interval = window.setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % normalizedImages.length);
      }, 3500);
    };
    const stop = () => {
      if (interval) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) start();
          else stop();
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [normalizedImages.length]);

  const current = normalizedImages[currentIndex];

  return (
    <div
      ref={containerRef}
      className="group/img relative aspect-square w-full overflow-hidden bg-surface"
    >
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={`${current.url}-${currentIndex}`}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <Image
            src={cloudinaryUrl(current.url, 600) || current.url}
            alt={`${label} ${currentIndex + 1}`}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading="lazy"
            decoding="async"
            className="object-contain object-center p-3 transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </motion.div>
      </AnimatePresence>

      <div className="absolute left-2 top-2 z-10 rounded-full bg-surface/90 px-2 py-0.5 text-[9px] font-semibold text-brand-navy shadow-sm sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
        {label}
      </div>

      {normalizedImages.length > 1 && (
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1 sm:bottom-3 sm:gap-1.5">
          {normalizedImages.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              aria-label={`Show image ${dotIndex + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(dotIndex);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 sm:h-2 ${dotIndex === currentIndex
                  ? "w-4 bg-brand-gold sm:w-5"
                  : "w-1.5 bg-brand-navy/20 sm:w-2"
                }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Simple radio option ──────────────────────────────────────── */

const RadioOption: React.FC<{
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}> = ({ name, value, label, checked, onChange }) => (
  <label
    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${checked
        ? "bg-brand-navy/[0.04] font-semibold text-brand-navy"
        : "font-medium text-brand-navy/60 hover:bg-[#F7F7F7] hover:text-brand-navy/80"
      }`}
  >
    <input
      type="radio"
      name={name}
      value={value}
      checked={checked}
      onChange={onChange}
      className="sr-only"
    />
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${checked ? "border-brand-gold" : "border-[#BFBFBF]"
        }`}
    >
      {checked && <span className="h-2 w-2 rounded-full bg-brand-gold" />}
    </span>
    <span className="leading-tight">{label}</span>
  </label>
);

/* ── Predefined price range buckets ──────────────────────────── */

const PRICE_RANGES = [
  { key: "all", label: "All Prices", min: null, max: null },
  { key: "under5k", label: "Under Rs. 5,000", min: null, max: 5000 },
  { key: "5k-10k", label: "Rs. 5,000 \u2013 Rs. 10,000", min: 5000, max: 10000 },
  { key: "10k-25k", label: "Rs. 10,000 \u2013 Rs. 25,000", min: 10000, max: 25000 },
  { key: "above25k", label: "Above Rs. 25,000", min: 25000, max: null },
] as const;

/* ── Page ──────────────────────────────────────────────────────── */

const ProductsPage: React.FC<ProductsPageProps> = ({ title = "Products" }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const categoryFilter = searchParams.get("category");
  const subcategoryFilter = searchParams.get("subcategory");
  const auth = useSelector((state: RootState) => state.auth);

  // Categories — slow-moving, 5 min cache (fetched unconditionally so the
  // sidebar category filter always has the real list).
  const { data: catRes } = useFetch<any>(`${baseUrl}category/getAllCategories`, {
    cacheKey: "categories",
    staleTime: 5 * 60 * 1000,
  });
  const { data: subRes } = useFetch<any>(
    categoryFilter
      ? `${baseUrl}subcategory/getSubcategoriesByCategory/${categoryFilter}`
      : "",
    { cacheKey: "subcategories", staleTime: 5 * 60 * 1000 },
  );

  const [products, setProducts] = useState<ProductData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [subcategoryName, setSubcategoryName] = useState("");
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);

  /* ── Server-driven listing state ── */
  // ONE page per request: every filter (category, subcategory, search, price,
  // colors, sizes, rating, sort) is sent to the backend and applied there —
  // the frontend never downloads the whole catalog or filters client-side.
  const [serverTotal, setServerTotal] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  /* ── Filter state (radio-button single-selection) ── */
  const [search, setSearch] = useState("");
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [selectedColor, setSelectedColor] = useState("all");
  const [selectedSize, setSelectedSize] = useState("all");
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortValue>("featured");
  const [sortOpen, setSortOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Build the /getAllProducts query string for a given page — every active
  // filter is forwarded to the backend (never applied client-side).
  const buildParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", pageNum.toString());
      params.set("limit", String(PAGE_SIZE));
      if (categoryFilter) params.set("category", categoryFilter);
      if (subcategoryFilter) params.set("subcategory", subcategoryFilter);
      const q = search.trim();
      if (q) params.set("search", q);
      // Price range (radio selection)
      const priceRange = PRICE_RANGES.find((r) => r.key === selectedPriceRange);
      if (priceRange && priceRange.key !== "all") {
        if (priceRange.min !== null) params.set("minPrice", priceRange.min.toString());
        if (priceRange.max !== null) params.set("maxPrice", priceRange.max.toString());
      }
      // Color (single radio selection)
      if (selectedColor && selectedColor !== "all") {
        params.set("colors", selectedColor);
      }
      // Size (single radio selection)
      if (selectedSize && selectedSize !== "all") {
        params.set("sizes", selectedSize);
      }
      if (minRating > 0) params.set("minRating", minRating.toString());
      // "featured" and "newest" both mean newest-first (the backend default);
      // only sort values that change the order are sent.
      if (sortBy === "price-low" || sortBy === "price-high" || sortBy === "rating") {
        params.set("sort", sortBy);
      }
      return params.toString();
    },
    [categoryFilter, subcategoryFilter, search, selectedPriceRange, selectedColor, selectedSize, minRating, sortBy],
  );

  // Sequence guard — a stale response (superseded by a newer fetch) is never
  // applied, so rapid filter changes can't mix pages together.
  const fetchSeq = React.useRef(0);

  // Fetch ONE page from the server with the current filters.
  const fetchProducts = useCallback(
    async (pageNum: number) => {
      const seq = ++fetchSeq.current;
      setListLoading(true);
      try {
        const { data } = await axios.get(
          `${baseUrl}product/getAllProducts?${buildParams(pageNum)}`,
          { withCredentials: true },
        );
        if (seq !== fetchSeq.current) return;
        const resData = data?.data;
        const list = Array.isArray(resData) ? resData : resData?.products ?? [];
        setProducts(Array.isArray(list) ? list : []);
        const pag = resData?.pagination;
        setServerTotal(typeof pag?.totalProducts === "number" ? pag.totalProducts : 0);
        setServerTotalPages(typeof pag?.totalPages === "number" ? pag.totalPages : 1);
        setListError(null);
      } catch (err: any) {
        if (seq !== fetchSeq.current) return;
        setListError(err?.response?.data?.message || "Failed to load products");
      } finally {
        if (seq === fetchSeq.current) setListLoading(false);
      }
    },
    [buildParams],
  );

  // Fetch page 1 whenever any filter/category/search/sort actually changes.
  // Debounced so typing in the search box doesn't fire a request per keystroke.
  // The query-string comparison guards against identity-only rebuilds of
  // buildParams (e.g. price bounds re-deriving after a fetch) — a refetch only
  // happens when the outgoing query for page 1 really differs.
  const lastParamsRef = React.useRef<string>("");
  useEffect(() => {
    const params = buildParams(1);
    if (params === lastParamsRef.current) return;
    lastParamsRef.current = params;
    setPage(1);
    const timer = setTimeout(() => fetchProducts(1), 250);
    return () => clearTimeout(timer);
  }, [buildParams, fetchProducts]);



  useEffect(() => {
    if (catRes?.data) {
      const cats = Array.isArray(catRes.data) ? catRes.data : [];
      setCategories(cats);
      if (categoryFilter) {
        const found = cats.find((c: any) => c._id === categoryFilter);
        if (found) setCategoryName(found.name);
      } else {
        setCategoryName("");
      }
    }
  }, [catRes, categoryFilter]);

  useEffect(() => {
    if (subRes?.data) {
      const list = Array.isArray(subRes.data) ? subRes.data : [];
      setSubcategories(list);
      if (subcategoryFilter) {
        const found = list.find((s: any) => s._id === subcategoryFilter);
        setSubcategoryName(found?.name || "");
      } else {
        setSubcategoryName("");
      }
    }
  }, [subRes, subcategoryFilter]);



  // Body scroll lock while the mobile filter drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);



  /* ── Derived filter data (from the currently loaded page) ── */
  const colorOptions = useMemo(() => {
    const map = new Map<string, string>(); // lower → original casing
    products.forEach((p) =>
      (p.colors || []).forEach((c) => {
        const t = c.trim();
        if (t) map.set(t.toLowerCase(), t);
      }),
    );
    return Array.from(map.entries());
  }, [products]);

  const sizeOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) =>
      (p.sizes || []).forEach((s) => {
        const t = s.trim();
        if (t) set.add(t);
      }),
    );
    return Array.from(set).sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
  }, [products]);

  const hasProducts = products.length > 0;

  // Server-driven pagination — each page change fetches that page from the
  // backend with the same filters (ONE request per page, never a burst).
  const goToPage = (target: number) => {
    const clamped = Math.max(1, Math.min(serverTotalPages, target));
    if (clamped === page) return;
    setPage(clamped);
    fetchProducts(clamped);
  };

  const clearAll = () => {
    setSearch("");
    setSelectedColor("all");
    setSelectedSize("all");
    setSelectedPriceRange("all");
    setMinRating(0);
    if (categoryFilter || subcategoryFilter) router.push("/productsPage");
  };

  const activeFilters: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (search.trim()) {
    activeFilters.push({
      key: "search",
      label: `"${search.trim()}"`,
      onClear: () => setSearch(""),
    });
  }
  if (selectedPriceRange !== "all") {
    const range = PRICE_RANGES.find((r) => r.key === selectedPriceRange);
    if (range) {
      activeFilters.push({
        key: "price",
        label: range.label,
        onClear: () => setSelectedPriceRange("all"),
      });
    }
  }
  if (selectedColor && selectedColor !== "all") {
    const label = colorOptions.find(([lower]) => lower === selectedColor)?.[1] ?? selectedColor;
    activeFilters.push({
      key: "color",
      label,
      onClear: () => setSelectedColor("all"),
    });
  }
  if (selectedSize && selectedSize !== "all") {
    activeFilters.push({
      key: "size",
      label: `Size ${selectedSize}`,
      onClear: () => setSelectedSize("all"),
    });
  }
  if (minRating > 0) {
    activeFilters.push({
      key: "rating",
      label: `${minRating}\u2605 & up`,
      onClear: () => setMinRating(0),
    });
  }

  const addToCart = async (product: Product) => {
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    try {
      const productId = product._id;
      if (!productId) return showToast("Invalid product", "error");
      const prodAny = product as any;
      if (getEffectiveStock(prodAny) <= 0)
        return showToast("Product is out of stock", "error");

      if (auth.username) {
        try {
          const res = await axios.post(
            `${baseUrl}cart/`,
            { productId, quantity: 1 },
            { withCredentials: true },
          );
          if (res.data?.status === "success" || res.data?.success === true || res.data?.data) {
            showToast("Added to cart", "success");
            window.dispatchEvent(new Event("cart-updated"));
            router.push("/cart");
          } else {
            showToast(res.data?.message || "Failed to add to cart", "error");
          }
        } catch (err: any) {
          console.error("Add to cart error", err);
          showToast(err?.response?.data?.message || "Failed to add to cart", "error");
        }
      } else {
        const local = getLocalCart();
        const exists = local.find((i: any) => (i._id || i.id) === productId);
        if (exists) {
          const newQty = (exists.quantity || 1) + 1;
          if (prodAny.stock !== undefined && newQty > prodAny.stock)
            return showToast(`Only ${prodAny.stock} items available`, "error");
          exists.quantity = newQty;
        } else {
          if (prodAny.stock !== undefined && 1 > prodAny.stock)
            return showToast(`Only ${prodAny.stock} items available`, "error");
          local.push({ ...product, _id: productId, quantity: 1 });
        }
        setLocalCart(local);
        showToast("Added to cart", "success");
        router.push("/cart");
      }
    } finally {
      setIsAddingToCart(false);
    }
  };

  const buyNow = async (product: Product) => {
    if (isBuyingNow) return;
    setIsBuyingNow(true);
    try {
      await addToCart(product);
      router.push("/checkout");
    } finally {
      setIsBuyingNow(false);
    }
  };

  /* ── Shared filter sidebar content (desktop sidebar + mobile drawer) ── */
  const renderFilters = () => (
    <div className="space-y-1">
      {/* Search */}
      <div className="pb-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
          Search
        </p>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy/35"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-brand-navy outline-none transition-colors placeholder:text-brand-navy/35 focus:border-brand-gold"
          />
        </div>
      </div>

      {/* Category */}
      <div className="border-t border-line py-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
          Category
        </p>
        <div role="radiogroup" aria-label="Category">
          <RadioOption
            name="category"
            value="all"
            label="All Products"
            checked={!categoryFilter}
            onChange={() => router.push("/productsPage")}
          />
          {categories.map((cat: CategoryData) => (
            <RadioOption
              key={cat._id}
              name="category"
              value={cat._id}
              label={cat.name}
              checked={categoryFilter === cat._id}
              onChange={() => router.push(`/productsPage?category=${cat._id}`)}
            />
          ))}
        </div>
      </div>

      {/* Subcategory (only when a category is selected) */}
      {categoryFilter && subcategories.length > 0 && (
        <div className="border-t border-line py-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
            Subcategory
          </p>
          <div role="radiogroup" aria-label="Subcategory">
            <RadioOption
              name="subcategory"
              value="all"
              label="All Subcategories"
              checked={!subcategoryFilter}
              onChange={() => router.push(`/productsPage?category=${categoryFilter}`)}
            />
            {subcategories.map((sub: any) => (
              <RadioOption
                key={sub._id}
                name="subcategory"
                value={sub._id}
                label={sub.name}
                checked={subcategoryFilter === sub._id}
                onChange={() =>
                  router.push(`/productsPage?category=${categoryFilter}&subcategory=${sub._id}`)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div className="border-t border-line py-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
          Price
        </p>
        <div role="radiogroup" aria-label="Price range">
          {PRICE_RANGES.map((range) => (
            <RadioOption
              key={range.key}
              name="price"
              value={range.key}
              label={range.label}
              checked={selectedPriceRange === range.key}
              onChange={() => setSelectedPriceRange(range.key)}
            />
          ))}
        </div>
      </div>

      {/* Colors */}
      {colorOptions.length > 0 && (
        <div className="border-t border-line py-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
            Color
          </p>
          <div role="radiogroup" aria-label="Color">
            <RadioOption
              name="color"
              value="all"
              label="All Colors"
              checked={!selectedColor || selectedColor === "all"}
              onChange={() => setSelectedColor("all")}
            />
            {colorOptions.map(([lower, original]) => (
              <RadioOption
                key={lower}
                name="color"
                value={lower}
                label={original}
                checked={selectedColor === lower}
                onChange={() => setSelectedColor(lower)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sizes */}
      {sizeOptions.length > 0 && (
        <div className="border-t border-line py-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
            Size
          </p>
          <div role="radiogroup" aria-label="Size">
            <RadioOption
              name="size"
              value="all"
              label="All Sizes"
              checked={!selectedSize || selectedSize === "all"}
              onChange={() => setSelectedSize("all")}
            />
            {sizeOptions.map((size) => (
              <RadioOption
                key={size}
                name="size"
                value={size}
                label={`Size ${size}`}
                checked={selectedSize === size}
                onChange={() => setSelectedSize(size)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      <div className="border-t border-line py-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy/40">
          Rating
        </p>
        <div role="radiogroup" aria-label="Rating">
          <RadioOption
            name="rating"
            value="all"
            label="All Ratings"
            checked={minRating === 0}
            onChange={() => setMinRating(0)}
          />
          {RATING_OPTIONS.map((opt) => (
            <RadioOption
              key={opt.value}
              name="rating"
              value={String(opt.value)}
              label={`${opt.value}\u2605 & up`}
              checked={minRating === opt.value}
              onChange={() => setMinRating(opt.value)}
            />
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      <div className="border-t border-line pt-4">
        <button
          type="button"
          onClick={clearAll}
          className="w-full rounded-lg border border-line bg-surface py-2.5 text-sm font-bold text-brand-navy/80 transition-colors hover:border-state-danger/40 hover:text-state-danger"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Featured";

  const renderProductCard = (prod: ProductData) => {
    const prodAny = prod as any;
    return (
      <motion.div
        key={prod._id}
        layout
        role="button"
        tabIndex={0}
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } } }}
        onClick={() => router.push(`/product/${prod._id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(`/product/${prod._id}`);
        }}
        className="group cursor-pointer overflow-hidden rounded-xl border border-line bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-brand-gold/30 hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)] sm:rounded-2xl"
      >
        <ProductCardImageCarousel images={prod.images} label={prodAny.category?.name ?? "Product"} />

        <div className="space-y-2 p-3 text-brand-navy sm:space-y-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] sm:gap-3 sm:text-xs">
            <span className="inline-flex items-center rounded-full border border-brand-gold/20 bg-brand-gold/10 px-2 py-0.5 font-semibold text-brand-navy sm:px-2.5">
              {prodAny.brand ?? "Irhas'Inn"}
            </span>
            <span className="hidden text-[10px] text-brand-navy/60 sm:inline-block sm:text-xs">
              {getEffectiveStock(prodAny) > 0 ? `${getEffectiveStock(prodAny)} in stock` : "Out of stock"}
            </span>
            {prod.freeShipping && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[8px] font-semibold text-brand-navy/70 sm:px-2 sm:text-[10px]">
                <Truck size={10} className="sm:hidden" />
                <Truck size={12} className="hidden sm:block" />
                <span className="hidden sm:inline">Free Shipping</span>
                <span className="sm:hidden">Free</span>
              </span>
            )}
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <h3 className="line-clamp-1 text-sm font-black leading-tight group-hover:text-brand-navy sm:text-base">
              {prod.name}
            </h3>
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2">
            {(() => {
              const { minPrice: mp, maxPrice: xp, hasRange } = getSizePriceRange(prod.variantPricing);
              const dp = hasRange ? mp : prod.price;
              return (
                <>
                  <p className="text-base font-black text-brand-navy sm:text-xl">
                    {hasRange ? `From ${formatPKR(mp)}` : `${formatPKR(dp)}`}
                  </p>
                </>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-line bg-surface p-3 sm:p-4">
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              buyNow(prod);
            }}
            disabled={isBuyingNow}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-brand-gold px-3 text-xs font-semibold text-white transition hover:bg-[#b8963e] disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-[40px] sm:text-sm"
          >
            {isBuyingNow ? (
              <span className="flex items-center gap-1">
                <Loader2 className="animate-spin" size={14} />
                Processing...
              </span>
            ) : (
              "Buy Now"
            )}
          </motion.button>
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addToCart(prod);
            }}
            disabled={isAddingToCart}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-brand-navy transition hover:border-brand-gold disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-[40px] sm:text-sm"
          >
            {isAddingToCart ? (
              <span className="flex items-center gap-1">
                <Loader2 className="animate-spin" size={14} />
                Adding...
              </span>
            ) : (
              "Add to Cart"
            )}
          </motion.button>
        </div>
      </motion.div>
    );
  };

  return (
    <>
      <style>{`
        /* Radio focus styling for accessibility */
        input[type=radio]:focus-visible + span { outline: 2px solid ${GOLD}; outline-offset: 2px; border-radius: 9999px; }
      `}</style>

      <section className="min-h-screen bg-surface py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-3 sm:px-6">
          {/* ── Page header ── */}
          <div className="mb-6 space-y-1.5 text-center sm:mb-8 sm:space-y-2">
            <span className="inline-block text-[9px] font-black uppercase tracking-[0.25em] text-brand-gold sm:text-[11px] sm:tracking-[0.3em]">
              {subcategoryName ? "Subcategory" : categoryName ? "Category" : "All Products"}
            </span>
            <h1 className="text-2xl font-black tracking-tight text-brand-navy sm:text-3xl md:text-4xl">
              {subcategoryName || categoryName || title}
            </h1>
            <p className="text-xs font-medium text-brand-navy/55 sm:text-sm">
              {subcategoryName && categoryName
                ? `inside ${categoryName}`
                : "Discover something made for you"}
            </p>
          </div>

          {/* ── Sidebar + products layout ── */}
          <div className="flex items-start gap-6 lg:gap-8">
            {/* Desktop filter sidebar */}
            <aside className="hidden w-[268px] shrink-0 lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface px-5 py-1">
                <div className="border-b border-line py-4">
                  <p className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wider text-brand-navy">
                    <SlidersHorizontal size={14} className="text-brand-gold" />
                    Filters
                  </p>
                </div>
                {renderFilters()}
              </div>
            </aside>

            {/* Products area */}
            <div className="min-w-0 flex-1">
              {/* Toolbar */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-brand-navy/60">
                  {serverTotal === 0 ? (
                    "Showing 0 Products"
                  ) : (
                    <>
                      Showing{" "}
                      <span className="font-bold text-brand-navy">
                        {(page - 1) * PAGE_SIZE + 1}–
                        {Math.min(page * PAGE_SIZE, serverTotal)}
                      </span>{" "}
                      of <span className="font-bold text-brand-navy">{serverTotal}</span>{" "}
                      {serverTotal === 1 ? "Product" : "Products"}
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-brand-navy transition-colors hover:border-brand-gold lg:hidden"
                  >
                    <SlidersHorizontal size={14} className="text-brand-navy/60" />
                    Filter &amp; Sort
                    {activeFilters.length > 0 && (
                      <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-white">
                        {activeFilters.length}
                      </span>
                    )}
                  </button>

                  {/* Sort dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSortOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-brand-navy transition-colors hover:border-brand-gold"
                    >
                      Sort: {currentSortLabel}
                      <ChevronDown
                        size={14}
                        className={`text-brand-navy/50 transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sortOpen && (
                      <>
                        <button
                          type="button"
                          aria-label="Close sort menu"
                          className="fixed inset-0 z-20 cursor-default"
                          onClick={() => setSortOpen(false)}
                        />
                        <div className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_14px_40px_rgba(0,0,0,0.12)] animate-dropdown-fade">
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setSortBy(opt.value);
                                setSortOpen(false);
                              }}
                              className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-sm font-semibold transition-colors ${sortBy === opt.value
                                  ? "bg-surface-muted/60 text-brand-navy"
                                  : "text-brand-navy/70 hover:bg-surface-muted/40"
                                }`}
                            >
                              {opt.label}
                              {sortBy === opt.value && (
                                <Check size={14} className="text-brand-gold" />
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Active filter chips */}
              {activeFilters.length > 0 && (
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/45">
                    Active:
                  </span>
                  {activeFilters.map((chip) => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-xs font-semibold text-brand-navy"
                    >
                      {chip.label}
                      <button
                        type="button"
                        onClick={chip.onClear}
                        aria-label={`Remove ${chip.label} filter`}
                        className="flex h-4 w-4 items-center justify-center rounded-full text-brand-navy/50 transition-colors hover:bg-surface-muted hover:text-brand-navy"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-bold text-state-danger transition-opacity hover:opacity-70"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Body: loading / error / empty / grid */}
              {listLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="overflow-hidden rounded-xl border border-line bg-surface sm:rounded-2xl"
                    >
                      <div className="aspect-square animate-pulse bg-surface-muted/60" />
                      <div className="space-y-2.5 p-3 sm:p-4">
                        <div className="h-3 w-3/4 animate-pulse rounded-full bg-surface-muted" />
                        <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-muted" />
                        <div className="h-8 animate-pulse rounded-lg bg-surface-muted/70" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : listError && !hasProducts ? (
                <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center">
                  <p className="text-lg font-black text-brand-navy">Something went wrong</p>
                  <p className="mt-1 text-sm text-brand-navy/60">
                    We could not load the products. Please try again.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-navy-deep"
                  >
                    Try Again
                  </button>
                </div>
              ) : serverTotal === 0 ? (
                <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center">
                  <p className="text-lg font-black text-brand-navy">No products found</p>
                  <p className="mt-1 text-sm text-brand-navy/60">
                    Try adjusting your filters or search.
                  </p>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-6 inline-flex items-center justify-center rounded-lg border border-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-navy hover:text-white"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <>
                  <motion.div
                    className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3"
                    variants={{
                      hidden: { opacity: 0 },
                      show: { opacity: 1, transition: { staggerChildren: 0.03 } },
                    }}
                    initial="hidden"
                    animate="show"
                    key={page}
                  >
                    {products.map(renderProductCard)}
                  </motion.div>

                  {/* Pagination — server-driven */}
                  {serverTotalPages > 1 && (
                    <nav
                      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
                      aria-label="Pagination"
                    >
                      <button
                        type="button"
                        onClick={() => goToPage(page - 1)}
                        disabled={page === 1}
                        className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-brand-navy transition-colors hover:border-brand-gold disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Prev
                      </button>
                      {getPageNumbers(page, serverTotalPages).map((n, i) =>
                        n === "ellipsis" ? (
                          <span
                            key={`ellipsis-${i}`}
                            className="flex h-9 items-center px-1 text-sm text-brand-navy/40"
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={n}
                            type="button"
                            onClick={() => goToPage(n)}
                            aria-current={n === page ? "page" : undefined}
                            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-bold transition-colors ${n === page
                                ? "border-brand-gold bg-brand-gold text-white shadow-md shadow-brand-gold/20"
                                : "border-line bg-surface text-brand-navy/75 hover:border-brand-gold"
                              }`}
                          >
                            {n}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        onClick={() => goToPage(page + 1)}
                        disabled={page === serverTotalPages}
                        className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-brand-navy transition-colors hover:border-brand-gold disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </nav>
                  )}

                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Mobile filter drawer ── */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <motion.button
              type="button"
              aria-label="Close filters"
              onClick={() => setDrawerOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-brand-navy/25 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-surface shadow-[0_-12px_50px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-brand-navy">
                  <SlidersHorizontal size={15} className="text-brand-gold" />
                  Filters
                </p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close filters"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-brand-navy/60 transition-colors hover:bg-surface-muted hover:text-brand-navy"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                {renderFilters()}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-line bg-surface px-5 py-4">
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-line py-2.5 text-sm font-bold text-brand-navy/75 transition-colors hover:border-state-danger/40 hover:text-state-danger"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg bg-brand-navy py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-navy-deep"
                >
                  Show {serverTotal} {serverTotal === 1 ? "Result" : "Results"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Contact />
    </>
  );
};

function ProductsPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface">
          <div className="h-10 w-10 animate-pulse rounded-full border-2 border-line border-t-brand-gold" />
        </div>
      }
    >
      <ProductsPage />
    </Suspense>
  );
}

export default memo(ProductsPageWrapper);