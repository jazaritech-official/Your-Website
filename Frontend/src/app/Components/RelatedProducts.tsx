"use client";
import { formatPKR } from "@/app/utils/format";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ShoppingCart, Star, Eye, ChevronRight, Loader2 } from "lucide-react";
import useFetch, {
  baseUrl,
  getLocalCart,
  setLocalCart,
  showToast,
  cloudinaryUrl,
  getSizePriceRange,
  getEffectiveStock,
} from "../utils/commonFunctions";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";

interface ApiProduct {
  _id: string;
  name: string;
  description?: string;
  price: number;
  brand?: string;
  stock?: number;
  category?: { name: string } | string;
  images?: Array<{ url: string }>;
  averageRating?: number;
  originalPrice?: number;
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
}

interface RelatedProductsApiResponse {
  status: number;
  message: string;
  data: ApiProduct[];
}

export default function RelatedProducts({ productId }: { productId: string }) {
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  // Which product's Buy/Cart action is in flight — shows an immediate spinner
  // and blocks re-entry so the click never feels frozen with zero feedback.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Related products — cached 60s so revisiting a product page (or switching
  // back and forth) doesn't refetch the same related set.
  const { data, loading } = useFetch<RelatedProductsApiResponse>(
    productId ? `${baseUrl}product/getProduct/${productId}/related?limit=6` : "",
    { cacheKey: "related_products", staleTime: 60 * 1000 },
  );

  const products = useMemo(() => data?.data ?? [], [data]);

  // Don't render anything if no related products
  if (loading) {
    return (
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-brand-gold" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-gold">
              You Might Also Like
            </span>
            <span className="h-px flex-1 bg-surface-muted" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-line-soft bg-surface overflow-hidden animate-pulse"
              >
                <div className="aspect-square bg-surface-muted" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-surface-muted rounded w-3/4" />
                  <div className="h-3 bg-surface-muted rounded w-1/2" />
                  <div className="h-4 bg-surface-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!products || products.length === 0) return null;

  const handleAddToCart = async (e: React.MouseEvent, product: ApiProduct) => {
    e.stopPropagation();
    if (busyId) return;
    setBusyId(product._id);
    try {
      if (auth.username) {
        try {
          await axios.post(
            `${baseUrl}cart`,
            { productId: product._id, quantity: 1 },
            { withCredentials: true },
          );
          showToast(`${product.name} added to cart`, "success");
          window.dispatchEvent(new Event("cart-updated"));
        } catch {
          showToast("Failed to add to cart", "error");
        }
        return;
      }
      const currentCart = getLocalCart() as Array<ApiProduct & { quantity: number }>;
      const existing = currentCart.find((item) => item._id === product._id);
      if (existing) existing.quantity += 1;
      else currentCart.push({ ...product, quantity: 1 });
      setLocalCart(currentCart);
      showToast(`${product.name} added to cart`, "success");
    } finally {
      setBusyId(null);
    }
  };

  const handleBuyNow = async (e: React.MouseEvent, product: ApiProduct) => {
    e.stopPropagation();
    if (busyId) return;
    setBusyId(product._id);
    try {
      if (auth.username) {
        try {
          await axios.post(
            `${baseUrl}cart`,
            { productId: product._id, quantity: 1 },
            { withCredentials: true },
          );
          window.dispatchEvent(new Event("cart-updated"));
          router.push("/checkout");
        } catch {
          showToast("Failed to add to cart", "error");
        }
        return;
      }
      const currentCart = getLocalCart() as Array<ApiProduct & { quantity: number }>;
      const existing = currentCart.find((item) => item._id === product._id);
      if (existing) existing.quantity += 1;
      else currentCart.push({ ...product, quantity: 1 });
      setLocalCart(currentCart);
      router.push("/checkout");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        {/* Section Header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px w-8 bg-brand-gold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-gold">
            You Might Also Like
          </span>
          <span className="h-px flex-1 bg-surface-muted" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {products.map((product) => {
            // Card-sized display transform (≈600px).
            const imageUrl =
              cloudinaryUrl(product.images?.[0]?.url, 600) ||
              "/carousel/Clothes.jpg";
            const { minPrice: minSizePrice, maxPrice: maxSizePrice, hasRange } =
              getSizePriceRange(product.variantPricing);
            const displayPrice = hasRange ? minSizePrice : product.price;
            const originalPrice = product.originalPrice || Math.round(displayPrice * 1.4);
            const discountPct = Math.round(((originalPrice - displayPrice) / originalPrice) * 100);
            const inStock = getEffectiveStock(product) > 0;
            const categoryName =
              typeof product.category === "string"
                ? product.category
                : product.category?.name ?? "";

            return (
              <div
                key={product._id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/product/${product._id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") router.push(`/product/${product._id}`);
                }}
                className="group flex flex-col cursor-pointer rounded-xl border border-line-soft bg-surface shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden"
              >
                {/* Image Container */}
                <div className="relative aspect-square bg-surface-muted/30 overflow-hidden">
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="bg-surface/90 backdrop-blur-sm text-brand-navy text-[9px] font-bold px-2.5 py-1.5 rounded-full shadow-md flex items-center gap-1 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                      <Eye size={11} />
                      Quick View
                    </span>
                  </div>
                  {discountPct > 0 && (
                    <div className="absolute top-0 left-0 z-10">
                      <div className="bg-gradient-to-r from-red-500 to-red-600 text-white text-[8px] font-bold px-2 py-0.5 rounded-br-lg shadow-sm">
                        -{discountPct}%
                      </div>
                    </div>
                  )}
                  {categoryName && (
                    <div className="absolute top-1.5 right-1.5 z-10">
                      <span className="bg-surface/80 backdrop-blur-sm text-[8px] font-bold text-brand-navy px-1.5 py-0.5 rounded-full shadow-sm">
                        {categoryName}
                      </span>
                    </div>
                  )}
                  {!inStock && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                      <span className="bg-surface text-[9px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                        Out of Stock
                      </span>
                    </div>
                  )}
                </div>

                {/* Info Section */}
                <div className="p-2.5 flex flex-col gap-1 flex-1">
                  <h3 className="text-xs font-bold text-brand-navy line-clamp-1 leading-tight group-hover:text-brand-gold transition-colors">
                    {product.name}
                  </h3>

                  {/* Star Rating */}
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={9}
                        className={
                          star <= Math.round(product.averageRating || 4)
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-200"
                        }
                      />
                    ))}
                    <span className="text-[9px] text-ink-subtle ml-0.5">
                      ({product.averageRating?.toFixed(1) || "4.8"})
                    </span>
                  </div>

                  {/* Price */}
                  <div className="flex items-end gap-1 mt-auto">
                    <p className="text-sm font-black text-brand-navy">
                      {hasRange ? `${formatPKR(minSizePrice)} - ${formatPKR(maxSizePrice)}` : `${formatPKR(displayPrice)}`}
                    </p>
                    {discountPct > 0 && (
                      <p className="text-[10px] text-ink-subtle line-through mb-0.5">
                        {formatPKR(originalPrice)}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-1 mt-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleBuyNow(e, product)}
                      disabled={!inStock || busyId === product._id}
                      className="flex items-center justify-center gap-1 bg-brand-gold hover:bg-brand-gold-hover active:bg-[#A8882E] text-white text-[9px] font-bold py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
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
                    <button
                      type="button"
                      onClick={(e) => handleAddToCart(e, product)}
                      disabled={!inStock || busyId === product._id}
                      className="flex items-center justify-center gap-1 border border-line text-brand-navy text-[9px] font-bold py-1.5 rounded-lg hover:border-brand-gold hover:text-brand-gold hover:bg-brand-gold/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
                    >
                      {busyId === product._id ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <>
                          <ShoppingCart size={10} />
                          Cart
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
    </section>
  );
}
