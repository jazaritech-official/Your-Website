"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { cloudinaryUrl } from "../utils/commonFunctions";

interface BannerData {
  _id: string;
  image: string;
  title?: string;
  subtitle?: string;
  tag?: string;
  link?: string;
}

interface PromoBannerProps {
  banners?: BannerData[];
}

/* ── Hardcoded fallbacks (used only when the API returns no banners) ── */
const FALLBACK_PROMOTIONS = [
  /* NOTE: these hrefs intentionally do NOT carry a ?category= filter.
     `category` is matched against a Mongo id (every other caller uses
     `?category=${cat._id}`), so the previous slug values ("azaadi", "eid",
     "pop-socket") filtered the catalogue down to zero results. Falling back
     to the unfiltered catalogue is the non-misleading behaviour. */
  {
    id: "fallback-1",
    title: "Azaadi Collection",
    image: "/Azadi Collection.jpg",
    subtitle: "Celebrate freedom with style",
    badge: "Shop Now",
    link: "/productsPage",
  },
  {
    id: "fallback-2",
    title: "Eid Collection",
    image: "/Eid Collection Banner.jpg",
    subtitle: "Celebrate in style",
    badge: "Limited Edition",
    link: "/productsPage",
  },
  {
    id: "fallback-3",
    title: "Customized Pop Sockets",
    image: "/Pop Socket Banner.jpg",
    subtitle: "Personalize your grip",
    badge: "Trending",
    link: "/productsPage",
  },
];

const PromoBanner: React.FC<PromoBannerProps> = ({ banners = [] }) => {
  // Build display items from API data, falling back to hardcoded defaults
  const displayItems = banners.length > 0
    ? banners.map((b) => ({
        id: b._id,
        title: b.title || "Collection",
        image: b.image,
        subtitle: b.subtitle || "",
        badge: b.tag || "Shop Now",
        link: b.link || "/productsPage",
      }))
    : FALLBACK_PROMOTIONS;

  return (
    <section className="bg-surface/72 py-10 md:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* =====================================================
            SECTION HEADER
        ====================================================== */}
        <div className="mb-7 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles
              size={15}
              strokeWidth={1.8}
              className="text-brand-gold"
            />

            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-navy">
              Featured Collections
            </span>
          </div>

          <div className="h-px flex-1 bg-brand-navy/10" />

          <div className="hidden h-px w-10 bg-brand-gold sm:block" />
        </div>

        {/* =====================================================
            PROMO CARDS
        ====================================================== */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {displayItems.map((promo) => {
            const rawImage = promo.image;
            const resolvedImage = cloudinaryUrl(rawImage, 600) || rawImage;

            return (
              <Link
                key={promo.id}
                href={promo.link}
                className="group relative block h-52 overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[transform,box-shadow,border-color] duration-500 hover:-translate-y-1 hover:border-brand-gold/50 hover:shadow-card-hover md:h-60"
              >

                {/* =================================================
                    CLEAN BANNER IMAGE
                    object-contain preserves full text without cropping
                ================================================== */}
                <div className="absolute inset-0 bg-surface">
                  <img
                    src={resolvedImage}
                    alt={promo.title}
                    loading="lazy"
                    decoding="async"
                    className=" absolute inset-0 h-full w-full object-contain transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                  />
                </div>

                {/* =================================================
                    VERY SUBTLE READABILITY PROTECTION
                    Neutral only — no colour tint
                ================================================== */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                {/* =================================================
                    PREMIUM BADGE
                ================================================== */}
                <div className="absolute left-4 top-4 z-10">
                  <span
                    className="inline-flex items-center rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-navy shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:border-brand-gold"
                  >
                    {promo.badge}
                  </span>
                </div>

                {/* =================================================
                    CONTENT
                    Hidden by default so the banner remains clean.
                    Appears elegantly on hover.
                ================================================== */}
                <div
                  className="absolute inset-x-0 bottom-0 z-10 p-5 transition-all duration-500 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
                >
                  <div className="rounded-field border border-white/15 bg-brand-navy/92 p-4">

                    <h3 className="text-lg font-bold leading-tight text-white md:text-xl">
                      {promo.title}
                    </h3>

                    <p className="mt-1 text-xs text-white/75">
                      {promo.subtitle}
                    </p>

                    <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-gold">
                      <span>Explore Collection</span>

                      <ArrowRight
                        size={14}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </div>

                  </div>
                </div>

                {/* =================================================
                    CLASSIC GOLD HOVER ACCENT
                ================================================== */}
                <div
                  className="pointer-events-none absolute inset-0 z-20 rounded-card border-2 border-transparent transition-all duration-500 group-hover:border-brand-gold/60"
                />

                {/* Bottom Gold Accent */}
                <div
                  className="absolute bottom-0 left-1/2 z-30 h-[2px] w-0 -translate-x-1/2 bg-brand-gold transition-all duration-500 group-hover:w-full"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PromoBanner;
