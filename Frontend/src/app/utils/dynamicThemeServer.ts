import { THEME_TAG, type ThemePayload } from "./dynamicTheme";
import { baseUrl } from "./apiBase";

/**
 * Server-only fetch of the admin-configured storefront theme.
 *
 * PERFORMANCE CONTRACT
 * --------------------
 * The root layout reads this on every render, so it must be cheap and it must
 * NEVER make a route dynamic. It deliberately does not use `no-store` (that
 * would opt every one of the app's prerendered routes into full SSR on each
 * request — a real regression). Instead it uses ISR + a cache tag:
 *
 *   • pages stay statically served (CDN), re-fetched at most every 5 minutes
 *   • an Admin save calls `revalidateTag(THEME_TAG)` through
 *     POST /api/theme/revalidate, so the new branding is live on the very next
 *     page load rather than after the 5-minute window
 *
 * FAIL-SAFE: any error (backend down, timeout, malformed JSON) returns null.
 * The layout then injects nothing, and the storefront renders with the
 * default values already compiled into `globals.css` — identical to the
 * pre-feature behaviour. A theme outage can never break a page.
 */
// Canonical base URL, normalised to always end in "/" (identical to before).
const API_BASE = baseUrl.replace(/\/?$/, "/");

export async function getServerTheme(): Promise<ThemePayload | null> {
  try {
    const res = await fetch(`${API_BASE}theme`, {
      headers: { accept: "application/json" },
      next: { revalidate: 300, tags: [THEME_TAG] },
      // Bounded so a hanging backend can never stall a page render.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data;
    if (!data || typeof data !== "object") return null;
    return data as ThemePayload;
  } catch {
    return null;
  }
}
