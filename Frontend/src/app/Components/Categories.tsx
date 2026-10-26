"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import useFetch, { baseUrl, cloudinaryUrl } from "../utils/commonFunctions";
import { EmptyState, ErrorState, SectionLabel } from "./ui";
import { LayoutGrid } from "lucide-react";

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);
  // Track which category card is currently hovered — drives the
  // subcategory dropdown (same behavior as the Navbar mega-menu).
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  // Shared 5-minute module cache: the 5 CategoryProductRows on the homepage
  // request the SAME categories endpoint, so one fetch serves them all.
  // `loading` / `error` / `reFetch` drive the loading, error and empty states
  // below so this section never sits on "Loading Categories..." permanently.
  const { data: catRes, loading, error, reFetch } = useFetch<any>(
    `${baseUrl}category/getAllCategories`,
    { cacheKey: "categories", staleTime: 5 * 60 * 1000 },
  );

  useEffect(() => {
    if (catRes?.data) {
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
    }
  }, [catRes]);

  return (
    <section className="bg-surface/72 py-8 sm:py-10 md:py-12">
      <div className="mx-auto max-w-7xl px-4">

        {/* ===========================
            SECTION HEADER
        ============================ */}
        <div className="mb-7">

          <div className="mb-2 flex items-center gap-3">
            <span className="h-px w-6 bg-brand-gold" />

            <SectionLabel>Shop by Category</SectionLabel>

            <span className="h-px flex-1 bg-line" />
          </div>

          <h2 className="text-2xl font-black tracking-tight text-brand-navy sm:text-3xl">
            Browse Our <span className="text-brand-gold-hover">Categories</span>
          </h2>

          <p className="mt-2 max-w-2xl text-xs text-ink-muted sm:text-sm">
            Explore our premium collections crafted for every lifestyle.
          </p>

        </div>

        {/* ===========================
            CATEGORY LIST
        ============================ */}

        {loading && categories.length === 0 ? (
          /* Skeleton circles mirror the real cards, so the strip never jumps. */
          <div className="flex gap-4 overflow-hidden pb-3 sm:justify-center md:gap-6 lg:gap-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-w-[110px] flex-col items-center">
                <div className="h-24 w-24 animate-pulse rounded-full bg-surface-muted sm:h-28 sm:w-28 md:h-32 md:w-32" />
                <div className="mt-4 h-3 w-20 animate-pulse rounded bg-surface-muted" />
                <div className="mt-2 h-2 w-14 animate-pulse rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        ) : error && categories.length === 0 ? (
          <ErrorState
            title="Unable to load categories"
            message="We could not reach the catalogue service. Please try again."
            onRetry={() => reFetch()}
            retryLabel="Try again"
            className="py-10"
          />
        ) : categories.length === 0 ? (
          <EmptyState
            compact
            icon={<LayoutGrid size={24} />}
            title="No categories yet"
            description="Categories will appear here as soon as they are published."
          />
        ) : (
          <div
            className="
              flex gap-4 overflow-x-auto pb-3
              snap-x snap-mandatory
              [-ms-overflow-style:none]
              [scrollbar-width:none]
              [&::-webkit-scrollbar]:hidden

              sm:flex-wrap
              sm:justify-center
              sm:overflow-visible
              sm:pb-0
              md:gap-6
              lg:gap-8
            "
          >
            {categories.map((cat: any) => {
              const subs = cat.subcategories || [];
              return (
                <div
                  key={cat._id}
                  className="relative min-w-[110px] snap-start"
                  onMouseEnter={() => setHoveredCat(cat._id)}
                  onMouseLeave={() => setHoveredCat(null)}
                >
                  <Link
                    href={`/productsPage?category=${cat._id}`}
                    className="group flex flex-col items-center"
                  >
                    {/* Circle */}
                    <div className="relative h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32">

                      {/* Ring */}
                      <div className="absolute -inset-1 rounded-full border border-brand-gold/20 transition-all duration-500 group-hover:border-brand-gold group-hover:scale-105" />

                      {/* Image */}
                      <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-white bg-[#F8FAFA] shadow-lg transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl">

                        <img
                          src={cloudinaryUrl(cat.image, 200) || "/carousel/Clothes.jpg"}
                          alt={cat.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 rounded-full bg-black/0 transition-all duration-500 group-hover:bg-black/20" />

                        {/* Hover Arrow */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-500 group-hover:opacity-100">

                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold text-white shadow-xl">

                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 12h14" />
                              <path d="m13 6 6 6-6 6" />
                            </svg>

                          </div>

                        </div>

                      </div>

                    </div>

                    {/* Name */}
                    <div className="mt-4 text-center">

                      <h3 className="max-w-[120px] truncate text-xs font-black text-brand-navy transition-colors duration-300 group-hover:text-brand-gold-hover sm:text-sm">
                        {cat.name}
                      </h3>

                      {/* Count label.
                          The API returns a lightweight `productCount` (an
                          aggregate count) and deliberately does NOT populate
                          `products` — reading `cat.products?.length` therefore
                          always evaluated to 0 and every category advertised
                          "0 Products". `products?.length` is kept only as a
                          fallback for any shape that still sends the array. */}
                      <div className="mt-1 flex items-center justify-center gap-1.5">

                        <span className="h-1 w-1 rounded-full bg-brand-gold" />

                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                          {(() => {
                            const count =
                              typeof cat.productCount === "number"
                                ? cat.productCount
                                : cat.products?.length ?? 0;
                            return `${count} ${count === 1 ? "Product" : "Products"}`;
                          })()}
                        </span>

                      </div>

                    </div>

                  </Link>

                  {/* ── Subcategory dropdown — same data, images, navigation
                       and animation as the Navbar mega-menu. Rendered only on
                       hover and only when the category has subcategories, so
                       cards without subcategories and mobile (no hover) are
                       completely unaffected. The pt-3 bridge keeps the hover
                       alive while moving from the card into the dropdown. ── */}
                  {hoveredCat === cat._id && subs.length > 0 && (
                    <div className="absolute left-1/2 top-full z-50 w-48 -translate-x-1/2 pt-3">
                      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-surface text-brand-navy shadow-2xl shadow-black/10 animate-dropdown-fade">
                        <div className="max-h-[60vh] overflow-y-auto p-1.5">
                          {subs.map((sub: any) => (
                            <Link
                              key={sub._id}
                              href={`/productsPage?category=${cat._id}&subcategory=${sub._id}`}
                              onClick={() => setHoveredCat(null)}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-gold/10 group/sub"
                            >
                              <img
                                src={cloudinaryUrl(sub.image, 200) || "/carousel/Clothes.jpg"}
                                alt={sub.name}
                                loading="lazy"
                                className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-gray-100"
                              />
                              <span className="text-[11px] font-semibold text-slate-600 transition-colors group-hover/sub:text-brand-navy">
                                {sub.name}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* The `.animate-dropdown-fade` class used by this dropdown is defined
          once in globals.css, so this component no longer depends on the
          Navbar being mounted to get its entrance animation. */}
    </section>
  );
};

export default Categories;