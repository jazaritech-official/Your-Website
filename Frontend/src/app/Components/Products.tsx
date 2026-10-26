"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import useFetch, { baseUrl } from "../utils/commonFunctions";
import { gridContainer, gridItem } from "../utils/motion";
import ProductCard from "./ProductCard";
import { ProductCardSkeleton } from "./PremiumSkeleton";
import { EmptyState, ErrorState, SectionLabel } from "./ui";
import { PackageOpen } from "lucide-react";

/* One shared grid definition for the real cards and the skeleton, so the
   placeholder occupies exactly the same box as the loaded card. */
const GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5";

interface ApiProduct {
  _id: string;
  name: string;
  description: string;
  price: number;
  brand?: string;
  stock?: number;
  category?: {
    name: string;
  };
  images?: Array<{
    url: string;
  }>;
  averageRating?: number;
  originalPrice?: number;
  colors?: string[];
  sizes?: string[];
  addedBy?: string;
}

interface ProductsApiResponse {
  status: number;
  message: string;
  data: {
    products: ApiProduct[];
  };
}

const Products: React.FC = () => {
  const router = useRouter();

  // Homepage products — cached 60s so back-navigation and repeat visits
  // don't refetch unchanged data (backend also Redis-caches this list).
  const { data, loading, error, reFetch } =
    useFetch<ProductsApiResponse>(
      `${baseUrl}product/getAllProducts?limit=10`,
      { cacheKey: "products_home", staleTime: 60 * 1000 },
    );

  const products = useMemo(
    () => data?.data?.products ?? [],
    [data],
  );

  /*
  =========================================================
  ERROR STATE
  =========================================================
  */

  if (error) {
    return (
      <section id="featured-products" className="bg-surface/72 py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <ErrorState
            title="Unable to load featured products"
            message="We could not reach the catalogue service right now."
            onRetry={() => reFetch()}
            retryLabel="Try again"
          />
        </div>
      </section>
    );
  }

  return (
    <section
      id="featured-products"
      className="bg-surface/72 py-10 md:py-14"
    >
      <div className="mx-auto max-w-7xl px-4">

        {/* =====================================================
            SECTION HEADER
        ====================================================== */}

        <div className="mb-7">

          {/* Small Label */}
          <div className="mb-2 flex items-center gap-3">
            <span className="h-px w-6 bg-brand-gold" />

            <SectionLabel>Featured Products</SectionLabel>

            <span className="h-px flex-1 bg-line" />
          </div>

          {/* Heading + View All */}
          <div className="flex items-end justify-between gap-4">

            <h2 className="text-2xl font-black leading-tight tracking-tight text-brand-navy sm:text-3xl">
              Our Featured <span className="text-brand-gold-hover">Products</span>
            </h2>

            {/* Desktop View All */}
            <button
              type="button"
              onClick={() =>
                router.push("/productsPage")
              }
              className="hidden shrink-0 text-xs font-bold text-brand-gold-hover transition-colors duration-200 hover:underline md:block"
            >
              View All →
            </button>
          </div>
        </div>

        {/* =====================================================
            LOADING STATE
        ====================================================== */}

        {loading ? (
          /* Reuses the shared ProductCardSkeleton instead of a bespoke
             placeholder. The old skeleton animated `blur-2xl` on five cards
             simultaneously — an expensive filter to re-rasterise every frame
             on a scrolling list — and did not match the real card's box. */
          <div className={GRID_CLASS}>
            {Array.from({ length: 10 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : products.length > 0 ? (

          /* =====================================================
             PRODUCT GRID
          ====================================================== */

          <motion.div
            className={GRID_CLASS}
            variants={gridContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
          >
            {products
              .slice(0, 10)
              .map((product) => (
                <motion.div key={product._id} variants={gridItem}>
                  <ProductCard product={product} />
                </motion.div>
              ))}
          </motion.div>

        ) : (

          /* =====================================================
             EMPTY STATE
          ====================================================== */

          <EmptyState
            icon={<PackageOpen size={26} />}
            title="No featured products yet"
            description="New arrivals are added regularly — browse the full catalogue in the meantime."
            action={
              <button
                type="button"
                onClick={() => router.push("/productsPage")}
                className="inline-flex h-11 items-center rounded-field bg-brand-navy px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-navy-soft"
              >
                Browse Catalogue
              </button>
            }
          />

        )}

        {/* =====================================================
            MOBILE VIEW ALL
        ====================================================== */}

        <div className="mt-7 text-center md:hidden">
          <button
            type="button"
            onClick={() =>
              router.push("/productsPage")
            }
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-gold-hover transition-colors duration-200 hover:underline"
          >
            View All Products →
          </button>
        </div>

      </div>
    </section>
  );
};

export default Products;