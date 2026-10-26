"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import useFetch, { baseUrl } from "../utils/commonFunctions";
import { fadeUp, gridContainer, gridItem } from "../utils/motion";
import ProductCard from "./ProductCard";

/* ── Types ───────────────────────────────────────────────────────── */

interface SectionCategory {
  _id: string;
  name: string;
  slug: string;
}

interface HomeSection {
  _id: string;
  image: string;
  category: SectionCategory | null;
  subcategory?: SectionCategory | null;
  order: number;
}

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
  colors?: string[];
  sizes?: string[];
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
  addedBy?: string;
}

interface ProductsApiResponse {
  data: {
    products: ApiProduct[];
  };
}

/* ── Per-section block (one products fetch per section, lazy) ────── */

const SECTION_PRODUCT_LIMIT = 8;

function HomeSectionBlock({ section }: { section: HomeSection }) {
  // Reuses the existing category-filtered products endpoint (same one the
  // products listing page uses) — no duplicate query path. Each section
  // fetches ONLY its own category/subcategory products, capped at a sane
  // limit, matching the existing "Featured Products" homepage pattern.
  const { data, loading } = useFetch<ProductsApiResponse>(
    `${baseUrl}product/getAllProducts?category=${section.category?._id || ""}${section.subcategory?._id ? `&subcategory=${section.subcategory._id}` : ""
    }&limit=${SECTION_PRODUCT_LIMIT}`,
    { cacheKey: `home_section_${section._id}`, staleTime: 60 * 1000 },
  );

  const products = data?.data?.products ?? [];

  return (
    <section className="bg-surface/72">
      {/* Full-width banner — subtle fade/slide entrance on scroll */}
      {/* Full-width banner — subtle fade/slide entrance on scroll */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={fadeUp}
        className="w-full bg-[#F8FAFA]/72 pt-8 md:pt-12"
      >
        <div className="relative mx-auto h-48 w-[80%] overflow-hidden md:h-72">
          <Image
            src={section.image}
            alt={section.category?.name || "Home section banner"}
            fill
            sizes="80vw"
            priority={false}
            loading="lazy"
            decoding="async"
            className="object-cover"
          />
        </div>
      </motion.div>

      {/* Category products grid */}
      <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
        {/* Section header */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-px w-6 bg-brand-gold" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-gold">
              {section.subcategory?.name
                ? `${section.category?.name} — ${section.subcategory.name}`
                : section.category?.name || "Collection"}
            </span>
            <span className="h-px flex-1 bg-surface-muted" />
          </div>
          <h2 className="text-2xl font-black leading-tight tracking-tight text-brand-navy sm:text-3xl">
            {section.subcategory?.name || section.category?.name || "Collection"}
          </h2>
        </div>

        {/* Loading skeleton (same square-card style as the Featured section) */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-line-soft bg-surface"
              >
                <div className="relative aspect-square animate-pulse bg-surface-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-surface-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-surface-muted" />
                  <div className="h-5 w-1/3 animate-pulse rounded bg-surface-muted" />
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <div className="h-8 animate-pulse rounded-lg bg-surface-muted" />
                    <div className="h-8 animate-pulse rounded-lg bg-surface-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          /* Product grid — reuses the EXACT ProductCard used by the
             Featured/Homepage Products section (image, price, Add to Cart,
             Buy Now). No duplicate card component. Viewport-triggered
             stagger so cards cascade in as the section scrolls into view. */
          <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5"
            variants={gridContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
          >
            {products.map((product) => (
              <motion.div key={product._id} variants={gridItem}>
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          /* Clean empty state — no broken grid */
          <div className="rounded-2xl border border-line-soft bg-surface py-14 text-center">
            <p className="text-sm text-ink-subtle">
              No products in this {section.subcategory?.name ? "subcategory" : "category"} yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Root: fetch active sections once, render in order ───────────── */

export default function HomeSections() {
  const { data, loading } = useFetch<{ data: HomeSection[] }>(
    `${baseUrl}home-sections`,
    { cacheKey: "home_sections", staleTime: 5 * 60 * 1000 },
  );

  // Sections are already ordered by the backend (order asc); sort defensively.
  const sections = [...(data?.data ?? [])].sort((a, b) => a.order - b.order);

  if (loading || sections.length === 0) return null;

  return (
    <>
      {sections.map((section, idx) => (
        <HomeSectionBlock key={section._id} section={section} />
      ))}
    </>
  );
}