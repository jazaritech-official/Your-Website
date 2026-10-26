"use client";

/**
 * ============================================================
 * SHOWCASE PROVIDER — active client-brand context
 * ------------------------------------------------------------
 * Mounted once inside ClientLayout. When a visitor opens a brand
 * showcase (/store/[slug] activates it), this provider:
 *   1. remembers the active slug (localStorage — refresh- and
 *      back-navigation-safe),
 *   2. fetches the PUBLISHED configuration from the public
 *      endpoint (drafts/previews are never reachable here),
 *   3. applies the brand's CSS custom properties at runtime via
 *      the SAME override mechanism the admin theme uses
 *      (utils/dynamicTheme → #ir-theme-overrides),
 *   4. supplies the brand's logo / name / tagline as an override
 *      so Navbar + Footer follow the active showcase on every
 *      route.
 *
 * SECURITY / PRIVACY
 *  • Only the public published-config endpoint is called — no
 *    auth cookies are used for brand data, and no draft state is
 *    ever readable here.
 *  • A stale/hand-edited slug that 404s clears itself and falls
 *    back to the default IRHAS'INN identity.
 *  • The floating "Viewing showcase — Exit" bar renders on customer
 *    routes whenever an override is active (for EVERY visitor, so the
 *    branded context is always visible and exitable), and NEVER on
 *    /Admin, /otpPage or /rider. The "Back to Showcase Studio" action
 *    is admin-only. Persisted context expires after 24h (or on Exit).
 * ============================================================
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ShowcaseOverrideProvider } from "../ThemeProvider";
import { applyThemeClientSide } from "../../utils/dynamicTheme";
import { baseUrl } from "../../utils/apiBase";
import {
  fetchPublicShowcase,
  isOverrideExcluded,
  readActiveShowcaseSlug,
  writeActiveShowcaseSlug,
  type ShowcasePublicConfig,
} from "../../utils/showcase";

interface ShowcaseContextValue {
  /** Currently active published showcase, if loaded. */
  profile: ShowcasePublicConfig | null;
  activeSlug: string | null;
  /** Activate a showcase by slug (visiting /store/[slug]). */
  activate: (slug: string) => Promise<void>;
  /** Return to the default IRHAS'INN identity. */
  deactivate: () => void;
}

const ShowcaseContext = createContext<ShowcaseContextValue>({
  profile: null,
  activeSlug: null,
  activate: async () => {},
  deactivate: () => {},
});

export function useShowcase(): ShowcaseContextValue {
  return useContext(ShowcaseContext);
}

function isAdminViewer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return false;
    const role = JSON.parse(raw)?.role;
    return role === "admin" || role === "superadmin";
  } catch {
    return false;
  }
}

export default function ShowcaseProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<ShowcasePublicConfig | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const overrideExcluded = isOverrideExcluded(pathname);

  const load = useCallback(async (slug: string) => {
    const data = await fetchPublicShowcase(slug, baseUrl);
    if (data) {
      // Wholesale replace — a slug swap can never leave tokens from the
      // previous brand behind (the CSS side is applied by the effect below).
      setProfile(data);
      setActiveSlug(slug);
    } else {
      // Stale or unpublished slug — reset to the default identity.
      writeActiveShowcaseSlug(null);
      setProfile(null);
      setActiveSlug(null);
    }
  }, []);

  // The CSS override is applied/cleared in ONE place so it can never leak
  // onto excluded routes (Admin / OTP / rider) or survive a slug swap or a
  // failed activation (F-context).
  useEffect(() => {
    if (overrideExcluded) {
      applyThemeClientSide(null);
      return;
    }
    applyThemeClientSide(profile?.theme?.cssVars || null);
  }, [overrideExcluded, profile]);

  // Restore context on mount (refresh / direct navigation).
  useEffect(() => {
    // Lazy updater: isAdminViewer() reads localStorage, which is only
    // available client-side — deferring it into the state updater keeps
    // this out of the render path and satisfies the setState-in-effect rule.
    setIsAdmin(() => isAdminViewer());
    const slug = readActiveShowcaseSlug();
    if (slug) void load(slug);
  }, [load]);

  const activate = useCallback(
    async (slug: string) => {
      writeActiveShowcaseSlug(slug);
      await load(slug);
      setIsAdmin(isAdminViewer());
    },
    [load],
  );

  const deactivate = useCallback(() => {
    writeActiveShowcaseSlug(null);
    setProfile(null);
    setActiveSlug(null);
    // The CSS override is cleared by the effect above when profile turns null.
    router.refresh();
  }, [router]);

  const value = useMemo<ShowcaseContextValue>(
    () => ({ profile, activeSlug, activate, deactivate }),
    [profile, activeSlug, activate, deactivate],
  );

  // Branding override fed into useBranding() — blank fields never clobber
  // the platform defaults, and the override is NEVER supplied on excluded
  // routes (Jazari admin plane / OTP / rider ops — F-context).
  const brandingOverride =
    profile && !overrideExcluded
      ? {
          logoUrl: profile.logoUrl || undefined,
          siteName: profile.brandName || undefined,
          tagline: profile.tagline || undefined,
        }
      : null;

  return (
    <ShowcaseContext.Provider value={value}>
      <ShowcaseOverrideProvider value={brandingOverride}>
        {children}

        {/* Viewing bar — shown to EVERYONE (not just admins) whenever a
            showcase override is active on a customer route, so the branded
            context is always visible, explainable and exitable (F-context).
            Never rendered on /Admin, /otpPage or /rider. */}
        {profile && !overrideExcluded && (
          <div className="fixed right-4 top-20 z-[90] flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-2 text-xs font-semibold text-ink shadow-lg backdrop-blur">
              <span className="hidden sm:inline">Viewing showcase:</span>
              <span className="max-w-[140px] truncate text-brand-gold-hover">
                {profile.brandName}
              </span>
              <button
                type="button"
                onClick={deactivate}
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted transition hover:border-brand-gold hover:text-brand-gold-hover"
                aria-label="Exit showcase and return to the default store"
              >
                <LogOut size={11} />
                Exit
              </button>
            </div>
            {activeSlug && isAdmin && (
              <button
                type="button"
                onClick={() => router.push(`/Admin/ShowcaseStudio`)}
                className="rounded-full border border-line bg-surface/95 px-3 py-1.5 text-[11px] font-semibold text-ink-muted shadow backdrop-blur transition hover:border-brand-gold hover:text-brand-gold-hover"
              >
                ← Back to Showcase Studio
              </button>
            )}
          </div>
        )}
      </ShowcaseOverrideProvider>
    </ShowcaseContext.Provider>
  );
}
