"use client";
import { formatPKR } from "@/app/utils/format";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star, ShoppingBag } from "lucide-react";
import useFetch, {
  baseUrl,
  cloudinaryUrl,
  getSizePriceRange,
} from "../utils/commonFunctions";
import { buttonStyles, SectionLabel } from "./ui";

interface ApiProduct {
  _id: string;
  name: string;
  description: string;
  price: number;
  stock?: number;
  images?: Array<{ url: string }>;
  averageRating?: number;
  category?: { name: string };
  freeShipping?: boolean;
  variantPricing?: Record<string, number>;
}

interface ProductsApiResponse {
  status: number;
  message: string;
  data: { products: ApiProduct[] };
}

const ProductSpotlight: React.FC = () => {
  const { data, loading } = useFetch<ProductsApiResponse>(
    `${baseUrl}product/getAllProducts?limit=10&sort=rating`,
    { cacheKey: "products_spotlight", staleTime: 60 * 1000 },
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  const products = useMemo(() => data?.data?.products ?? [], [data]);

  // Pick top-rated products with high discounts
  const spotlightProducts = useMemo(() => {
    return products
      .filter((p) => p.stock && p.stock > 0 && p.freeShipping)
      .slice(0, 5);
  }, [products]);

  const product = spotlightProducts[currentIndex];
  const hasMultiple = spotlightProducts.length > 1;

  const goNext = () => {
    if (currentIndex < spotlightProducts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      setCurrentIndex(spotlightProducts.length - 1);
    }
  };

  if (loading) {
    return (
      <section className="py-12 bg-white/72">
        <div className="max-w-7xl mx-auto px-4">
          <div className="animate-pulse h-96 rounded-2xl bg-gray-100" />
        </div>
      </section>
    );
  }

  if (!product) return null;

  // Spotlight hero image — larger display transform (≈1200px).
  const imageUrl =
    cloudinaryUrl(product.images?.[0]?.url, 1200) || "/carousel/Clothes.jpg";
  const shortDesc = product.description
    ? product.description.split(".").slice(0, 2).join(".") + "."
    : "";

  /* Size-wise products keep their real prices in `variantPricing`; the backend
     deliberately forces the flat `price` to 0, so reading `product.price`
     rendered "Rs 0" for every size-priced product. */
  const { minPrice, maxPrice, hasRange } = getSizePriceRange(product.variantPricing);
  const displayPrice = hasRange ? minPrice : product.price;

  /* Rating renders only when the product genuinely has one — previously an
     absent rating was shown as a fabricated ★★★★☆ 4.8. */
  const rating =
    typeof product.averageRating === "number" ? product.averageRating : 0;
  const hasRating = rating > 0;

  return (
    <section className="bg-surface-page/72 py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Label */}
        <div className="mb-8 flex items-center gap-3">
          <span className="h-px w-8 bg-brand-gold" />
          <SectionLabel>Featured Spotlight</SectionLabel>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* Navigation Arrows */}
          {hasMultiple && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand-navy shadow-md transition-colors hover:bg-brand-gold hover:text-white"
                aria-label="Previous product"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={goNext}
                className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-brand-navy shadow-md transition-colors hover:bg-brand-gold hover:text-white"
                aria-label="Next product"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Left - Image */}
            <div className="relative aspect-square min-h-[300px] bg-surface-muted md:aspect-auto md:h-full">
              <img
                src={imageUrl}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-contain p-8"
              />
              {/* Dots */}
              {hasMultiple && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {spotlightProducts.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentIndex(i)}
                      aria-label={`Show product ${i + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        i === currentIndex ? "w-5 bg-brand-gold" : "w-2 bg-line"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right - Details */}
            <div className="p-6 md:p-10 flex flex-col justify-center">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-gold-hover">
                {product.category?.name || "Featured Product"}
              </p>
              <h2 className="mb-3 text-2xl font-black leading-tight tracking-tight text-brand-navy md:text-3xl">
                {product.name}
              </h2>

              {hasRating && (
                <div className="mb-4 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={16}
                      className={
                        star <= Math.round(rating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-line"
                      }
                    />
                  ))}
                  <span className="ml-1 text-xs text-ink-muted">
                    {rating.toFixed(1)}
                  </span>
                </div>
              )}

              {/* Real description.
                  Four hardcoded "feature" bullets lived here — including
                  "Free shipping on orders over Rs. 2000", which contradicted
                  the admin-configurable freeShippingThreshold in Settings, and
                  "Easy 7-day return policy", which nothing in the platform
                  implements. The component already computed the trimmed
                  description (shortDesc) but never rendered it. */}
              {shortDesc && (
                <p className="mb-5 text-sm leading-relaxed text-ink-muted">
                  {shortDesc}
                </p>
              )}

              {/* Price */}
              <div className="mb-6">
                <p className="text-3xl font-black tracking-tight text-brand-navy">
                  {hasRange
                    ? `From ${formatPKR(displayPrice)}`
                    : `${formatPKR(displayPrice)}`}
                </p>
                {hasRange && (
                  <p className="mt-1 text-xs font-semibold text-ink-subtle">
                    up to {formatPKR(maxPrice)}
                  </p>
                )}
              </div>

              <Link
                href={`/product/${product._id}`}
                className={buttonStyles({
                  variant: "gold",
                  size: "lg",
                  className: "w-full md:w-auto",
                })}
              >
                <ShoppingBag size={18} />
                View Product
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductSpotlight;
