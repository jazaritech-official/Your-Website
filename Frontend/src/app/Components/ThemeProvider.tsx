"use client";

/**
 * ============================================================
 * THEME PROVIDER — carries the admin-configured BRANDING to
 * client components.
 * ------------------------------------------------------------
 * The COLOURS need no provider: they are CSS custom properties injected
 * server-side by the root layout, so every token utility picks them up
 * automatically.
 *
 * The LOGO / SITE NAME / TAGLINE are different — they are element *content*,
 * not styling, so client components (Navbar, Footer, loaders, 404…) need the
 * actual values during render.
 *
 * These values arrive as PROPS FROM THE SERVER (the root layout already holds
 * them from the same request), never from a client-side fetch. That matters:
 *  • no extra request, and no second source of truth for the branding
 *  • the values are present in the prerendered HTML, so there is no
 *    placeholder-then-swap flicker and no hydration mismatch — the server and
 *    the first client render receive identical props
 *  • an unreachable backend simply means the defaults below are used, which are
 *    byte-identical to the strings these components rendered before the feature
 * ============================================================
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_LOGO_URL,
  DEFAULT_SITE_NAME,
  DEFAULT_TAGLINE,
  resolveLogoUrl,
} from "../utils/dynamicTheme";

export interface Branding {
  /** Custom logo URL when uploaded, otherwise the built-in asset. */
  logoUrl: string;
  siteName: string;
  tagline: string;
}

/**
 * The pre-feature hard-coded branding. Used as the context's default value, so
 * a consumer rendered outside the provider (during a partial/isolated render,
 * or in a test) still gets exactly the old output rather than blank text.
 */
export const FALLBACK_BRANDING: Branding = {
  logoUrl: DEFAULT_LOGO_URL,
  siteName: DEFAULT_SITE_NAME,
  tagline: DEFAULT_TAGLINE,
};

const ThemeContext = createContext<Branding>(FALLBACK_BRANDING);

/* ── Showcase (client-brand) override ──────────────────────
   When a visitor is browsing a brand showcase (/store/[slug]),
   the ShowcaseProvider supplies the client brand's identity as
   an OVERRIDE on top of the platform-owner branding the root
   layout read from the theme singleton. `useBranding()` merges
   the two, so Navbar/Footer/logo rendering follows the active
   showcase on every route while the Jazari/IRHAS'INN identity
   remains the untouched default everywhere else.
   Empty/blank override fields never clobber the defaults. */
const ShowcaseOverrideContext = createContext<Partial<Branding> | null>(null);

export function ShowcaseOverrideProvider({
  value,
  children,
}: {
  value: Partial<Branding> | null;
  children: ReactNode;
}) {
  return (
    <ShowcaseOverrideContext.Provider value={value}>
      {children}
    </ShowcaseOverrideContext.Provider>
  );
}

export function ThemeProvider({
  branding,
  children,
}: {
  branding?: Partial<Branding> | null;
  children: React.ReactNode;
}) {
  const value: Branding = {
    logoUrl: resolveLogoUrl(branding?.logoUrl),
    siteName: branding?.siteName?.trim() || DEFAULT_SITE_NAME,
    tagline: branding?.tagline?.trim() || DEFAULT_TAGLINE,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Read the active branding. Safe to call anywhere in the client tree — outside
 * the provider it returns the original hard-coded defaults.
 */
export function useBranding(): Branding {
  const base = useContext(ThemeContext);
  const override = useContext(ShowcaseOverrideContext);
  if (!override) return base;
  return {
    logoUrl: override.logoUrl?.trim() || base.logoUrl,
    siteName: override.siteName?.trim() || base.siteName,
    tagline: override.tagline?.trim() || base.tagline,
  };
}
