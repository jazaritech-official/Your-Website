import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import ShowcaseHome from "../../Components/showcase/ShowcaseHome";
import ShowcaseActivator from "../../Components/showcase/ShowcaseActivator";
import { buildThemeCss } from "../../utils/dynamicTheme";
import type { ShowcasePublicConfig } from "../../utils/showcase";
import { baseUrl } from "../../utils/apiBase";

/** Mirrors the backend slug rules — anything else 404s before hitting the API. */
const SLUG_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * ============================================================
 * /store/[slug] — PUBLIC BRAND SHOWCASE STOREFRONT
 * ------------------------------------------------------------
 * Server-rendered branded homepage for one PUBLISHED showcase
 * profile. The backend only serves published configurations, so
 * a draft or archived profile 404s here by construction.
 *
 * THEME: the profile's colour tokens are injected as a `html:root`
 * override block AFTER the root layout's default-theme block, so
 * the same Tailwind utilities render the client brand with zero
 * per-component changes.
 *
 * CONTEXT: ShowcaseActivator registers the slug as the active
 * showcase (localStorage) so product/cart/checkout routes keep
 * the brand identity for this visitor.
 *
 * SHARED CATALOG: products shown are the real shared catalog
 * records the operator featured for this profile.
 * ============================================================
 */

// ISR: static-ish serving with a 5-minute freshness window (mirrors the
// theme system). Tagged per slug so future on-demand revalidation can be
// added without touching this file.
const SHOWCASE_REVALIDATE = 300;

async function getShowcase(slug: string): Promise<ShowcasePublicConfig | null> {
  try {
    const res = await fetch(`${baseUrl}brand-profiles/public/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: SHOWCASE_REVALIDATE, tags: [`showcase-${slug}`] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as ShowcasePublicConfig) || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const showcase = await getShowcase(slug);
  if (!showcase) return { title: "Showcase not found" };

  const name = showcase.brandName || "Store";
  const title = showcase.seoTitle?.trim() || `${name} | Online Store`;
  const description =
    showcase.seoDescription?.trim() ||
    showcase.tagline?.trim() ||
    `Shop ${name} — curated products, secure checkout and live order tracking.`;

  return {
    title,
    description,
    ...(showcase.faviconUrl ? { icons: { icon: showcase.faviconUrl } } : {}),
    openGraph: {
      type: "website",
      siteName: name,
      title,
      description,
      ...(showcase.hero?.image ? { images: [{ url: showcase.hero.image, alt: name }] } : {}),
    },
    // Per-profile indexing control (default NOINDEX): demo storefronts are
    // demo/marketing pages on the platform domain and stay out of search
    // until the operator opts in via the SEO tab. The /store directory page
    // itself is always noindex.
    robots: showcase.seoIndexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default async function ShowcaseStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SLUG_SAFE.test(slug)) notFound();

  const showcase = await getShowcase(slug);
  if (!showcase || showcase.status !== "published") notFound();

  const themeCss = buildThemeCss(showcase.theme?.cssVars);
  const headingFont =
    showcase.theme?.typography === "classic-serif" || showcase.theme?.typography === "editorial"
      ? "Georgia, 'Times New Roman', serif"
      : "system-ui, -apple-system, 'Segoe UI', sans-serif";

  return (
    <>
      {/* Registers this showcase as the visitor's active brand context. */}
      <ShowcaseActivator slug={slug} />

      {/* Profile colour tokens — injected after the root layout's default
          theme block so equal-specificity rules resolve to this brand. */}
      {themeCss && (
        <style
          id={`showcase-theme-${slug}`}
          dangerouslySetInnerHTML={{ __html: themeCss }}
        />
      )}

      {/* Brand masthead — identity strip above the storefront content. */}
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {showcase.logoUrl ? (
              <Image
                src={showcase.logoUrl}
                alt={showcase.brandName}
                width={44}
                height={44}
                priority
                className="h-11 w-11 rounded-xl border border-line object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-navy text-sm font-black text-brand-gold">
                {showcase.brandName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p
                className="truncate text-lg font-black leading-tight text-ink"
                style={{ fontFamily: headingFont }}
              >
                {showcase.brandName}
              </p>
              {showcase.tagline && (
                <p className="truncate text-xs text-ink-muted">{showcase.tagline}</p>
              )}
            </div>
          </div>
          <a
            href="/productsPage"
            className="hidden shrink-0 rounded-xl bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy-deep transition hover:bg-brand-gold-hover sm:inline-flex"
          >
            {showcase.hero?.primaryCta?.label || "Shop All"}
          </a>
        </div>
      </div>

      <div className="min-h-[60vh] bg-surface-page pb-10">
        <ShowcaseHome config={showcase} />
      </div>

      {/* Brand footer — attribution follows the profile's poweredBy flag. */}
      <footer className="border-t border-line bg-brand-navy">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-8 text-center">
          <p className="text-sm font-bold text-white">{showcase.brandName}</p>
          {showcase.footer?.description && (
            <p className="max-w-xl text-xs leading-relaxed text-white/60">
              {showcase.footer.description}
            </p>
          )}
          <p className="mt-2 text-[11px] text-white/40">
            {showcase.footer?.poweredBy !== false
              ? "Powered by Jazari Tech Official"
              : `© ${new Date().getFullYear()} ${showcase.brandName}`}
          </p>
        </div>
      </footer>
    </>
  );
}
