// src/app/page.tsx
// Server Component — fetches banner data server-side for instant SSR content.
// All interactive child components (Carousel, Categories, Products, etc.)
// remain Client Components and are unaffected by this change.

import Image from "next/image";
import { Banknote, MapPin, Palette, ShieldCheck } from "lucide-react";
import Carousel from "./Components/Carousel";
import Categories from "./Components/Categories";
import PromoBanner from "./Components/PromoBanner";
import Products from "./Components/Products";
import ProductSpotlight from "./Components/ProductSpotlight";
import CategoryProductRow from "./Components/CategoryProductRow";
import LookingForSomething from "./Components/LookingForSomething";
import About from "./Components/About";
import Contact from "./Components/Contact";
import RecentlyViewed from "./Components/RecentlyViewed";
import HashScrollHandler from "./Components/HashScrollHandler";
import SectionReveal from "./Components/SectionReveal";
import HomeSections from "./Components/HomeSections";
// Canonical API base URL (server-safe shared module; no local redeclaration).
import { baseUrl as API_BASE } from "@/app/utils/apiBase";

/* ── Brand trust strip ─────────────────────────────────────────────
   Static, server-rendered, zero client JS. Every statement below is an
   already-shipped capability of this platform:
     · Palette      — product customisation is the core product
     · ShieldCheck  — httpOnly-cookie JWT checkout
     · Banknote     — Cash on Delivery is a supported payment method
     · MapPin       — live order tracking (Pusher + Google Maps)
   A "Free Shipping" claim is deliberately NOT made: free shipping is an
   admin-gated configuration, so advertising it here could contradict the
   live setting shown in the free-shipping progress bar.
   ────────────────────────────────────────────────────────────────── */

const TRUST_POINTS = [
  {
    icon: Palette,
    title: "Personalised For You",
    copy: "Add your own logo, name or text to selected products.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Checkout",
    copy: "Your session is protected end-to-end on every order.",
  },
  {
    icon: Banknote,
    title: "Cash on Delivery",
    copy: "Pay at your doorstep once your parcel arrives.",
  },
  {
    icon: MapPin,
    title: "Live Order Tracking",
    copy: "Follow your delivery in real time from dispatch onwards.",
  },
] as const;

/* ── Server-side data types ────────────────────────────────────── */

interface BannerData {
  _id: string;
  image: string;
  title?: string;
  subtitle?: string;
  tag?: string;
  link?: string;
  categoryRef?: { _id: string; name: string; slug: string } | null;
}

/* ── Server-side banner fetching ───────────────────────────────── */

async function fetchBanners(): Promise<{
  catBanners: BannerData[];
  brandBanner: BannerData | null;
}> {
  try {
    const [catRes, brandRes] = await Promise.all([
      fetch(`${API_BASE}homepage-banners?type=categoryBanner`, {
        next: { revalidate: 300 }, // ISR: revalidate every 5 min (matches backend Redis TTL)
      }),
      fetch(`${API_BASE}homepage-banners?type=brandBanner`, {
        next: { revalidate: 300 },
      }),
    ]);

    const catJson = await catRes.json();
    const brandJson = await brandRes.json();

    // Pass full category banner objects to PromoBanner (not just title→image)
    const catData = catJson?.data;
    const catBanners: BannerData[] =
      Array.isArray(catData) ? catData : [];

    // Process brand banner — take first one
    const brandData = brandJson?.data;
    const brandBanner: BannerData | null =
      Array.isArray(brandData) && brandData.length > 0 ? brandData[0] : null;

    return { catBanners, brandBanner };
  } catch {
    // Graceful degradation: if API is unreachable, render with fallback images
    return { catBanners: [], brandBanner: null };
  }
}

/* ── Page Component (Server Component) ─────────────────────────── */

export default async function Home() {
  const { catBanners, brandBanner } = await fetchBanners();

  // Helper to resolve a banner image: try lookup first, fall back to hardcoded path
  // Helper to resolve a banner image: try API lookup by title, fall back to hardcoded path
  const bannerImage = (name: string, fallback: string) => {
    const found = catBanners.find((b) => b.title === name);
    return found?.image || fallback;
  };

  return (
    <main className="w-full min-h-screen bg-surface text-brand-navy overflow-x-clip">
      {/* Client-side hash scroll handler (lightweight, returns null) */}
      <HashScrollHandler />

      {/* SECTION 1: Hero Carousel (Asymmetric Grid) — Client Component */}
      <Carousel />

      {/* SECTION 2: Brand Trust Strip — Server Component, no client JS.
          Sits directly under the hero so the value proposition and the
          four trust signals are visible without any scrolling. */}
      <section
        aria-label="Why shop with Irhas'Inn"
        className="border-y border-line bg-surface-muted/72"
      >
        <div className="mx-auto max-w-7xl px-4 py-8 sm:py-9">
          <ul className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4">
            {TRUST_POINTS.map(({ icon: Icon, title, copy }) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-brand-gold/12 text-brand-gold-hover"
                >
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold leading-tight text-brand-navy">
                    {title}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-muted">
                    {copy}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SECTION 3: Category Icon Strip (Circular) — Client Component */}
      <Categories />

      {/* SECTION 4: Promo Banner Grid (3 Tiles) — Client Component */}
      <PromoBanner banners={catBanners} />

      {/* SECTION 5: Featured Products Grid — Client Component */}
      <Products />

      {/* SECTION 6: Product Spotlight Banner — Client Component */}
      <SectionReveal>
        <ProductSpotlight />
      </SectionReveal>

      {/* SECTION 7: Brand Statement Banner (manageable from Admin) —
          wrapped in SectionReveal like its sibling sections for a subtle
          fade-up entrance on scroll. */}
      <SectionReveal delay={0}>
        <section className="relative h-48 md:h-56 overflow-hidden bg-brand-navy">
          <Image
            src={brandBanner?.image || "/Studio Banner.jpeg"}
            alt={brandBanner?.title || "Irhas'Inn - Customize Product All In One"}
            width={1600}
            height={600}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-7xl mx-auto px-4 w-full">
              <p className="text-brand-gold text-sm font-bold tracking-[0.3em] uppercase mb-1">
                {brandBanner?.title || "Irhas'Inn"}
              </p>
              <h2 className="text-white text-2xl md:text-4xl font-black leading-tight">
                Customize Product{" "}
                <span className="text-brand-gold">All In One</span>
              </h2>
              <p className="text-white/60 text-sm mt-1 max-w-xl">
                {brandBanner?.subtitle || "Premium Quality — Delivered with Care Across Pakistan"}
              </p>
            </div>
          </div>
        </section>
      </SectionReveal>

      {/* SECTION 7b: Admin-built Home Sections (banner + category products).
          Renders immediately AFTER the hero/CTA brand banner above, in the
          order defined by the admin. The existing "Featured Products"
          section (SECTION 5) is left untouched above. Lazy-mount so section
          product queries fire only when the section approaches the viewport. */}
      <SectionReveal lazy>
        <HomeSections />
      </SectionReveal>

      {/* SECTION 8: Category-Themed Product Row - Azaadi Collection */}
      <SectionReveal delay={0}>
        <CategoryProductRow
          categoryName="Azaadi Collection"
          categorySlug="clothes"
          categoryImage={bannerImage("Azaadi Collection", "/Azadi Collection.jpg")}
        />
      </SectionReveal>

      {/* SECTION 9: Another Category Product Row - Eid Collection */}
      <SectionReveal delay={50} lazy>
        <CategoryProductRow
          categoryName="Eid Collection"
          categorySlug="accessories"
          categoryImage={bannerImage("Eid Collection", "/Eid Collection Banner.jpg")}
        />
      </SectionReveal>

      {/* SECTION 10: Customized Mugs Row */}
      <SectionReveal delay={0} lazy>
        <CategoryProductRow
          categoryName="Customized Mugs"
          categorySlug="accessories"
          categoryImage={bannerImage("Customized Mugs", "/mug banner.jpg")}
        />
      </SectionReveal>

      {/* SECTION 11: Customized Hajj Gifts Row */}
      <SectionReveal delay={50} lazy>
        <CategoryProductRow
          categoryName="Customized Hajj Gifts"
          categorySlug="accessories"
          categoryImage={bannerImage("Customized Hajj Gifts", "/Hajj Bannaer.jpg")}
        />
      </SectionReveal>

      {/* SECTION 11b: Customize Pop Socket Row */}
      <SectionReveal delay={0} lazy>
        <CategoryProductRow
          categoryName="Customize Pop Socket"
          categorySlug="accessories"
          categoryImage={bannerImage("Customize Pop Socket", "/Pop Socket Banner.jpg")}
        />
      </SectionReveal>

      {/* SECTION 11c: Recently Viewed Products — Client Component */}
      <RecentlyViewed />

      {/* SECTION 12: "Looking for Something Else?" Search Section — Client Component */}
      <LookingForSomething />

      {/* SECTION 13: About Us */}
      <SectionReveal>
        <About />
      </SectionReveal>

      {/* SECTION 14: Contact Us — Client Component */}
      <SectionReveal>
        <Contact />
      </SectionReveal>
    </main>
  );
}
