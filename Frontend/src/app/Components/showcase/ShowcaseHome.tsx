import Image from "next/image";
import Link from "next/link";
import {
  Banknote,
  MapPin,
  Palette,
  ShieldCheck,
  ArrowRight,
  PackageSearch,
  Sparkles,
} from "lucide-react";
import type {
  ShowcasePublicConfig,
  ShowcaseProduct,
  ShowcaseCategory,
} from "../../utils/showcase";
import { formatPKR } from "../../utils/format";

/**
 * ============================================================
 * SHOWCASE HOME — branded storefront renderer
 * ------------------------------------------------------------
 * Renders a PUBLISHED (or admin-previewed) showcase configuration
 * into a full branded homepage. Pure presentational component:
 * every value arrives via props, it holds no data fetching and no
 * client hooks, so it renders identically:
 *   • server-side on /store/[slug] (public, SEO-friendly)
 *   • client-side inside the Showcase Studio's authenticated
 *     preview of a DRAFT configuration
 *
 * CATALOG HONESTY
 * Products/categories shown here are REAL catalog records the
 * operator selected for this showcase. An empty selection renders
 * a polished empty state — never placeholder/fake inventory.
 * ============================================================
 */

/* Honest, static trust points — each is an already-shipped platform
   capability (no invented policies). */
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

/**
 * Closed-set layout variants (F-variant). The backend sanitizer guarantees
 * a section's `variant` is one of these names (unknown values fall back to
 * "default"), and each name maps ONLY to known Tailwind class sets — never
 * arbitrary CSS from config.
 */
const PRODUCT_VARIANT_CLASS: Record<string, string> = {
  default: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
  compact: "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6",
  scroll: "flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]",
};

const CATEGORY_VARIANT_CLASS: Record<string, string> = {
  default: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
  compact: "grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6",
};

const TYPOGRAPHY_FONT: Record<string, string> = {
  "classic-serif": "Georgia, 'Times New Roman', serif",
  "modern-sans": "system-ui, -apple-system, 'Segoe UI', sans-serif",
  editorial: "'Playfair Display', Georgia, serif",
  minimal: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

function ProductTile({ product }: { product: ShowcaseProduct }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-muted">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 45vw, 240px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-subtle">
            <PackageSearch size={28} />
          </div>
        )}
        {!product.inStock && (
          <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {product.name}
        </p>
        <p className="mt-auto text-[15px] font-black text-brand-gold-hover">
          {formatPKR(product.price)}
        </p>
      </div>
    </Link>
  );
}

function CategoryTile({ category }: { category: ShowcaseCategory }) {
  return (
    <Link
      href={`/productsPage?category=${encodeURIComponent(category.slug)}`}
      className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-surface-muted"
    >
      {category.image && (
        <Image
          src={category.image}
          alt={category.name}
          fill
          sizes="(max-width: 640px) 45vw, 220px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-base font-bold text-white drop-shadow">{category.name}</p>
      </div>
    </Link>
  );
}

function SectionHeading({
  heading,
  subtitle,
}: {
  heading: string;
  subtitle: string;
}) {
  if (!heading && !subtitle) return null;
  return (
    <div className="mb-6 text-center">
      {heading && (
        <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
          {heading}
        </h2>
      )}
      {subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-line bg-surface-muted/50 px-6 py-10 text-center">
      <PackageSearch size={26} className="mx-auto text-ink-subtle" />
      <p className="mt-3 text-sm font-semibold text-ink">{label}</p>
      <p className="mt-1 text-xs text-ink-muted">
        Select real products for this showcase from the Showcase Studio.
      </p>
    </div>
  );
}

export default function ShowcaseHome({ config }: { config: ShowcasePublicConfig }) {
  const densityClass =
    config.theme.typography === "minimal" ? "max-w-7xl px-4 sm:px-6" : "max-w-7xl px-4";
  const headingFont = TYPOGRAPHY_FONT[config.theme.typography] || TYPOGRAPHY_FONT["modern-sans"];

  const sections = config.sections.filter((s) => s.visible !== false);
  const hero = config.hero;
  const heroImage = hero.image;

  return (
    <main
      className={`mx-auto w-full space-y-14 pb-20 pt-6 sm:space-y-16 ${densityClass}`}
      style={{ fontFamily: "inherit" }}
    >
      {/* ── HERO ── (from profile hero config, or the hero section entry) */}
      {(heroImage || hero.heading) && (
        <section className="relative overflow-hidden rounded-3xl border border-line bg-surface-muted">
          <div className="relative min-h-[320px] w-full sm:min-h-[420px]">
            {heroImage && (
              <Image
                src={heroImage}
                alt={hero.heading || config.brandName}
                fill
                priority
                sizes="100vw"
                className="object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-transparent" />
            <div className="relative flex min-h-[320px] max-w-2xl flex-col justify-center gap-4 p-6 sm:min-h-[420px] sm:p-12">
              <h1
                className="text-3xl font-black leading-tight text-white drop-shadow sm:text-5xl"
                style={{ fontFamily: headingFont }}
              >
                {hero.heading || config.brandName}
              </h1>
              {hero.subheading && (
                <p className="max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
                  {hero.subheading}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-3">
                {hero.primaryCta.label && (
                  <Link
                    href={hero.primaryCta.href || "/productsPage"}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-brand-navy-deep transition hover:bg-brand-gold-hover"
                  >
                    {hero.primaryCta.label}
                    <ArrowRight size={15} />
                  </Link>
                )}
                {hero.secondaryCta.label && hero.secondaryCta.href && (
                  <Link
                    href={hero.secondaryCta.href}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    {hero.secondaryCta.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── CONFIGURED SECTIONS (saved order) ── */}
      {sections.map((section) => {
        switch (section.type) {
          case "hero":
            // The profile-level hero block at the top already renders the hero.
            return null;

          case "featuredCategories":
          case "categoryRow": {
            const heading = section.heading || "Shop by Category";
            if (!section.categories.length) {
              return (
                <section key={section.id}>
                  <SectionHeading heading={heading} subtitle={section.subtitle} />
                  <EmptyState label="No categories selected for this showcase yet" />
                </section>
              );
            }
            return (
              <section key={section.id}>
                <SectionHeading heading={heading} subtitle={section.subtitle} />
                <div
                  className={
                    CATEGORY_VARIANT_CLASS[section.variant] ||
                    CATEGORY_VARIANT_CLASS.default
                  }
                >
                  {section.categories.map((c) => (
                    <CategoryTile key={c.id} category={c} />
                  ))}
                </div>
              </section>
            );
          }

          case "featuredProducts": {
            const heading = section.heading || "Featured Products";
            if (!section.products.length) {
              return (
                <section key={section.id}>
                  <SectionHeading heading={heading} subtitle={section.subtitle} />
                  <EmptyState label="No products selected for this showcase yet" />
                </section>
              );
            }
            const isScrollRow = section.variant === "scroll";
            return (
              <section key={section.id}>
                <SectionHeading heading={heading} subtitle={section.subtitle} />
                <div
                  className={
                    PRODUCT_VARIANT_CLASS[section.variant] ||
                    PRODUCT_VARIANT_CLASS.default
                  }
                >
                  {section.products.map((p) =>
                    isScrollRow ? (
                      <div key={p.id} className="w-44 shrink-0 snap-start">
                        <ProductTile product={p} />
                      </div>
                    ) : (
                      <ProductTile key={p.id} product={p} />
                    ),
                  )}
                </div>
              </section>
            );
          }

          case "promoBanner": {
            if (!section.image && !section.heading) return null;
            // Closed-set variant: "centered" centers the content over a flat
            // scrim; "default" keeps the left-aligned gradient. Class sets
            // only — never config-driven CSS.
            const centered = section.variant === "centered";
            return (
              <section
                key={section.id}
                className="relative overflow-hidden rounded-3xl border border-line bg-brand-navy"
              >
                {section.image && (
                  <Image
                    src={section.image}
                    alt={section.heading || config.brandName}
                    fill
                    sizes="100vw"
                    className="object-cover opacity-80"
                  />
                )}
                <div
                  className={
                    centered
                      ? "absolute inset-0 bg-black/55"
                      : "absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent"
                  }
                />
                <div
                  className={`relative flex min-h-[200px] flex-col justify-center gap-2 p-6 sm:p-10 ${
                    centered
                      ? "mx-auto max-w-3xl items-center text-center"
                      : "max-w-xl"
                  }`}
                >
                  {section.heading && (
                    <h2
                      className="text-2xl font-black leading-tight text-white sm:text-3xl"
                      style={{ fontFamily: headingFont }}
                    >
                      {section.heading}
                    </h2>
                  )}
                  {section.subtitle && (
                    <p className="text-sm text-white/80">{section.subtitle}</p>
                  )}
                  {section.ctaLabel && section.ctaHref && (
                    <Link
                      href={section.ctaHref}
                      className="mt-2 inline-flex w-fit items-center gap-2 rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy-deep transition hover:bg-brand-gold-hover"
                    >
                      {section.ctaLabel}
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              </section>
            );
          }

          case "brandIntro":
            if (!section.heading && !section.subtitle) return null;
            return (
              <section key={section.id} className="mx-auto max-w-3xl text-center">
                <SectionHeading heading={section.heading} subtitle={section.subtitle} />
              </section>
            );

          case "trustRow":
            return (
              <section
                key={section.id}
                className="rounded-3xl border border-line bg-surface-muted/60 px-5 py-8"
                aria-label="Why shop here"
              >
                <ul className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4">
                  {TRUST_POINTS.map(({ icon: Icon, title, copy }) => (
                    <li key={title} className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold/15 text-brand-gold-hover"
                      >
                        <Icon size={18} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold leading-tight text-ink">{title}</p>
                        <p className="mt-1 text-[11px] leading-snug text-ink-muted">{copy}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );

          case "reviewSummary":
            // Operator-written copy only — no synthetic ratings or counts.
            if (!section.heading && !section.subtitle) return null;
            return (
              <section
                key={section.id}
                className="mx-auto max-w-3xl rounded-3xl border border-line bg-surface px-6 py-10 text-center shadow-sm"
              >
                <Sparkles size={20} className="mx-auto text-brand-gold" />
                {section.heading && (
                  <h2
                    className="mt-3 text-2xl font-black text-ink"
                    style={{ fontFamily: headingFont }}
                  >
                    {section.heading}
                  </h2>
                )}
                {section.subtitle && (
                  <p className="mt-2 text-sm text-ink-muted">{section.subtitle}</p>
                )}
              </section>
            );

          default:
            return null;
        }
      })}

      {/* ── CATEGORIES STRIP (profile-level ordering, when no section covers it) ── */}
      {!sections.some((s) => s.type === "featuredCategories" || s.type === "categoryRow") &&
        config.categories.length > 0 && (
          <section>
            <SectionHeading heading="Shop by Category" subtitle="" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {config.categories.map((c) => (
                <CategoryTile key={c.id} category={c} />
              ))}
            </div>
          </section>
        )}

      {/* ── CONTACT / FOOTER STRIP ── */}
      {(config.contact.email || config.contact.phone || config.contact.address) && (
        <section className="rounded-3xl border border-line bg-surface px-6 py-8 text-center">
          <h2 className="text-lg font-black text-ink">Get in touch</h2>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            {config.contact.phone && <span>{config.contact.phone}</span>}
            {config.contact.email && (
              <a href={`mailto:${config.contact.email}`} className="text-brand-gold-hover hover:underline">
                {config.contact.email}
              </a>
            )}
            {config.contact.address && <span>{config.contact.address}</span>}
          </div>
          {Object.keys(config.contact.social).length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {Object.entries(config.contact.social).map(([network, url]) => (
                <a
                  key={network}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-line bg-surface-muted px-4 py-1.5 text-xs font-semibold capitalize text-ink-muted transition hover:border-brand-gold hover:text-brand-gold-hover"
                >
                  {network}
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── DEMO WATERMARK (explicitly opt-in per profile) ── */}
      {config.previewWatermark && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-line bg-surface/95 px-4 py-2 text-xs font-semibold text-ink-muted shadow-lg backdrop-blur">
          {config.watermarkText || "Prepared by Jazari Tech Official"}
        </div>
      )}
    </main>
  );
}
