"use client";
import { formatPKR } from "@/app/utils/format";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import axios from "axios";
import { ChevronLeft, ChevronRight, ShoppingBag, ShoppingCart, Star, Loader2 } from "lucide-react";
import { RootState } from "../Redux/store";
import useFetch, {
  baseUrl,
  getLocalCart,
  setLocalCart,
  showToast,
  cloudinaryUrl,
  getSizePriceRange,
} from "../utils/commonFunctions";

interface ApiProduct {
  _id: string;
  name: string;
  description: string;
  price: number;
  stock?: number;
  images?: Array<{ url: string }>;
  averageRating?: number;
  variantPricing?: Record<string, number>;
}

interface CategoryRowProps {
  categoryName: string;
  categorySlug: string;
  categoryImage: string;
  productCount?: number;
}

interface ProductsApiResponse {
  status: number;
  message: string;
  data: { products: ApiProduct[] };
}

const CategoryProductRow: React.FC<CategoryRowProps> = ({
  categoryName,
  categorySlug,
  categoryImage,
  productCount,
}) => {
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which product's Cart/Buy action is in flight — shows an immediate spinner
  // and blocks re-entry so the click never feels frozen with zero feedback.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fetch all categories to find the real MongoDB ID. Shared 5-minute module
  // cache: every row + the category strip request the SAME endpoint on the
  // homepage, so this collapses 6 identical requests into 1.
  const { data: catRes } = useFetch<any>(`${baseUrl}category/getAllCategories`, {
    cacheKey: "categories",
    staleTime: 5 * 60 * 1000,
  });
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Real total for the category (exact Mongo count, served with the same
  // categories payload this component already loads).
  const [categoryTotal, setCategoryTotal] = useState<number | null>(null);

  useEffect(() => {
    if (catRes?.data) {
      const cats = Array.isArray(catRes.data) ? catRes.data : [];
      // Match by the categorySlug (e.g. "clothes" matches "Clothes")
      const matched = cats.find(
        (cat: any) => cat.name?.toLowerCase() === categorySlug.toLowerCase()
      );
      if (matched?._id) {
        setCategoryId(matched._id);
        setCategoryTotal(
          typeof matched.productCount === "number" ? matched.productCount : null,
        );
      }
    }
  }, [catRes, categorySlug]);

  // Only fetch products when we have a real category ID. Cached 60s — the
  // URL already includes the category, so each row's entry is distinct.
  const { data } = useFetch<ProductsApiResponse>(
    categoryId ? `${baseUrl}product/getAllProducts?limit=8&category=${categoryId}` : "",
    { cacheKey: "products_category_row", staleTime: 60 * 1000 }
  );

  const products = useMemo(() => data?.data?.products ?? [], [data]);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.6;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const doAddToCart = async (product: ApiProduct) => {
    if (busyId) return;
    setBusyId(product._id);
    try {
      await doAddToCartCore(product);
    } finally {
      setBusyId(null);
    }
  };

  const doAddToCartCore = async (product: ApiProduct) => {
    if (auth.username) {
      try {
        await axios.post(
          `${baseUrl}cart`,
          { productId: product._id, quantity: 1 },
          { withCredentials: true }
        );
        showToast(`${product.name} added to cart`, "success");
        window.dispatchEvent(new Event("cart-updated"));
      } catch {
        showToast("Failed to add to cart", "error");
      }
      return;
    }
    const currentCart = getLocalCart() as Array<ApiProduct & { quantity: number }>;
    const existing = currentCart.find((i) => i._id === product._id);
    if (existing) existing.quantity += 1;
    else currentCart.push({ ...product, quantity: 1 });
    setLocalCart(currentCart);
    showToast(`${product.name} added to cart`, "success");
  };

  if (products.length === 0) return null;

  const viewAllLink = categoryId
    ? `/productsPage?category=${categoryId}`
    : `/productsPage`;

  /* The tile previously printed `products.length`, i.e. only the products this
     row happened to load (capped at 8) — so a 40-product category advertised
     "8 Items". The exact category count is already available from the
     categories payload, so prefer it. */
  const totalItems = productCount ?? categoryTotal ?? products.length;

  return (
    <section className="py-10 bg-white/72">
      <div className="max-w-7xl mx-auto px-4">
        {/* Section Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-6 w-1 shrink-0 rounded-full bg-brand-gold" />
            <h2 className="truncate text-lg font-black tracking-tight text-brand-navy md:text-2xl">
              {categoryName}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => scroll("left")}
              aria-label={`Scroll ${categoryName} left`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-brand-navy transition-colors hover:border-brand-gold hover:text-brand-gold-hover"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => scroll("right")}
              aria-label={`Scroll ${categoryName} right`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-brand-navy transition-colors hover:border-brand-gold hover:text-brand-gold-hover"
            >
              <ChevronRight size={16} />
            </button>
            <Link
              href={viewAllLink}
              className="ml-1 hidden text-xs font-bold text-brand-gold-hover hover:underline sm:block"
            >
              View All →
            </Link>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Category Tile */}
          <Link
            href={viewAllLink}
            className="group relative w-36 shrink-0 overflow-hidden rounded-card md:w-48"
          >
            <img
              src={cloudinaryUrl(categoryImage, 600) || "/carousel/Clothes.jpg"}
              alt={categoryName}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/90">
                {totalItems} {totalItems === 1 ? "Item" : "Items"}
              </p>
              <h3 className="text-white font-black text-sm md:text-base leading-tight">
                {categoryName}
              </h3>
            </div>
          </Link>

          {/* Product Scroll */}
          <div
            ref={scrollRef}
            className="flex-1 flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory pb-2"
          >
            {products.map((product) => {
              const { minPrice: minSizePrice, maxPrice: maxSizePrice, hasRange } =
                getSizePriceRange(product.variantPricing);
              const displayPrice = hasRange ? minSizePrice : product.price;
              // 600px card transform — never download the full-res original.
              const img =
                cloudinaryUrl(product.images?.[0]?.url, 600) ||
                "/carousel/Clothes.jpg";

              return (
                <div
                  key={product._id}
                  onClick={() => router.push(`/product/${product._id}`)}
                  className="group/card relative w-36 shrink-0 cursor-pointer snap-start overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-card-hover md:w-44"
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden bg-surface-muted">
                    <img
                      src={img}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-contain p-3 group-hover/card:scale-105 transition-transform duration-500"
                    />
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    {/* A real <Link> keeps the product reachable by keyboard
                        (the outer element is a mouse-only <div onClick>). */}
                    <Link
                      href={`/product/${product._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="line-clamp-1 text-xs font-bold leading-tight text-brand-navy transition-colors hover:text-brand-gold-hover"
                    >
                      {product.name}
                    </Link>

                    {/* Rating renders only when the product actually has one —
                        previously an absent rating showed a filled star and a
                        fabricated "4.8". */}
                    {typeof product.averageRating === "number" &&
                      product.averageRating > 0 && (
                        <div className="mt-1 flex items-center gap-0.5">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          <span className="text-[10px] text-ink-muted">
                            {product.averageRating.toFixed(1)}
                          </span>
                        </div>
                      )}

                    <div className="mt-1.5">
                      <p className="text-xs font-black text-brand-navy">
                        {hasRange
                          ? `From ${formatPKR(displayPrice)}`
                          : `${formatPKR(displayPrice)}`}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          doAddToCart(product);
                        }}
                        disabled={busyId === product._id}
                        className="flex min-h-9 items-center justify-center gap-1 rounded-[0.55rem] bg-brand-gold py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === product._id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <>
                            <ShoppingCart size={10} />
                            Add
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (busyId) return;
                          setBusyId(product._id);
                          doAddToCartCore(product)
                            .then(() => router.push("/checkout"))
                            .finally(() => setBusyId(null));
                        }}
                        disabled={busyId === product._id}
                        className="flex min-h-9 items-center justify-center gap-1 rounded-[0.55rem] border border-line py-1.5 text-[10px] font-bold text-brand-navy transition-colors hover:border-brand-gold hover:text-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === product._id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <>
                            <ShoppingBag size={10} />
                            Buy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CategoryProductRow;
