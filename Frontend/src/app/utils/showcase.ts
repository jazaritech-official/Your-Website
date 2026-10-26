/**
 * ============================================================
 * SHOWCASE — SHARED TYPES + CLIENT HELPERS
 * ------------------------------------------------------------
 * Typed contracts for the Brand Showcase (white-label) system.
 * The shapes below mirror the backend projections exactly:
 *   • public payload  → brandProfileController.resolvePublicConfig()
 *   • admin payload   → brandProfileController.toAdminShape()
 *
 * ACTIVE SHOWCASE CONTEXT
 * The active showcase slug is remembered in localStorage so the
 * branded experience survives refresh and in-app navigation.
 * Only PUBLISHED configurations are ever fetched by this client
 * code (the public endpoint 404s anything else), so a stale or
 * hand-edited slug can never load draft data.
 * ============================================================
 */

export interface ShowcaseProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  inStock: boolean;
}

export interface ShowcaseCategory {
  id: string;
  name: string;
  slug: string;
  image: string;
}

export interface ShowcaseSection {
  id: string;
  type:
    | "hero"
    | "featuredCategories"
    | "featuredProducts"
    | "categoryRow"
    | "promoBanner"
    | "brandIntro"
    | "trustRow"
    | "reviewSummary";
  visible: boolean;
  variant: string;
  heading: string;
  subtitle: string;
  image: string;
  imageMobile: string;
  ctaLabel: string;
  ctaHref: string;
  products: ShowcaseProduct[];
  categories: ShowcaseCategory[];
}

export interface ShowcasePublicConfig {
  slug: string | null;
  status: string | null;
  brandName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  seoTitle: string;
  seoDescription: string;
  /** Per-profile indexing opt-in — absent/false means noindex,nofollow. */
  seoIndexable?: boolean;
  industry: string;
  theme: {
    colors: Record<string, string>;
    cssVars: Record<string, string>;
    typography: string;
  };
  hero: {
    image: string;
    imageMobile: string;
    heading: string;
    subheading: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  sections: ShowcaseSection[];
  categories: ShowcaseCategory[];
  contact: {
    address: string;
    phone: string;
    email: string;
    whatsapp: string;
    social: Record<string, string>;
  };
  footer: {
    description: string;
    poweredBy: boolean;
  };
  previewWatermark: boolean;
  watermarkText: string;
  publishedAt?: string | null;
}

/* ── override route exclusion (F-context) ───────────────────── */

/**
 * Routes where a client-brand override must NEVER apply:
 *  • /Admin/*  — the Jazari Tech internal control plane,
 *  • /otpPage  — the auth flow,
 *  • /rider/*  — the rider ops workflow belongs to the real operating
 *                business, never to a demo brand.
 */
export const OVERRIDE_EXCLUDED_PREFIXES = ["/Admin", "/otpPage", "/rider"];

export const isOverrideExcluded = (pathname: string | null): boolean =>
  !!pathname &&
  OVERRIDE_EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

/* ── localStorage persistence ───────────────────────────────── */

const LS_KEY = "jazari:activeShowcase";

/**
 * Persisted showcase context EXPIRES (F-context): a demo flavour must not
 * outlive a reasonable visit. 24 hours from activation; Exit clears it
 * immediately.
 */
export const SHOWCASE_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;

const SLUG_RE = /^[a-z0-9-]{1,60}$/;

interface StoredShowcaseContext {
  slug: string;
  ts: number;
}

export function readActiveShowcaseSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    // Legacy bare-slug format (pre-expiry): stamp it now and keep it — it
    // was written by a real visit, and expiry applies from here on.
    if (SLUG_RE.test(raw)) {
      const stamped: StoredShowcaseContext = { slug: raw, ts: Date.now() };
      window.localStorage.setItem(LS_KEY, JSON.stringify(stamped));
      return raw;
    }
    const parsed = JSON.parse(raw) as Partial<StoredShowcaseContext>;
    const slug = typeof parsed.slug === "string" ? parsed.slug : "";
    const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
    if (!SLUG_RE.test(slug) || !Number.isFinite(ts)) {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    if (Date.now() - ts > SHOWCASE_CONTEXT_TTL_MS) {
      // Expired — clear so the next visit starts un-branded.
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    return slug;
  } catch {
    // Storage or parse failure — never trust the value; clear it so the
    // next read starts clean.
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* storage unavailable */
    }
    return null;
  }
}

export function writeActiveShowcaseSlug(slug: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (slug) {
      const stamped: StoredShowcaseContext = { slug, ts: Date.now() };
      window.localStorage.setItem(LS_KEY, JSON.stringify(stamped));
    } else {
      window.localStorage.removeItem(LS_KEY);
    }
  } catch {
    /* storage unavailable — context is per-visit only */
  }
}

/* ── fetch helpers ──────────────────────────────────────────── */

/**
 * Fetch a PUBLISHED showcase config by slug (public endpoint — no auth).
 * Returns null on any failure so callers degrade gracefully.
 */
export async function fetchPublicShowcase(
  slug: string,
  baseUrl: string,
): Promise<ShowcasePublicConfig | null> {
  try {
    const res = await fetch(`${baseUrl}brand-profiles/public/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      // Bounded so a hanging backend never stalls a page or hydration.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as ShowcasePublicConfig) || null;
  } catch {
    return null;
  }
}
