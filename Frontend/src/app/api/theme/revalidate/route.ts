import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTheme } from "@/app/utils/dynamicThemeServer";
import { baseUrl } from "@/app/utils/apiBase";

/**
 * On-demand theme revalidation.
 *
 * The root layout reads the theme through an ISR-cached `fetch` tagged
 * `store-theme` (see utils/dynamicThemeServer.ts). That keeps every prerendered
 * route static — but it would also mean an Admin's save took up to the
 * revalidate window to appear for other visitors. The Admin "Website
 * Appearance" page calls this route right after a successful save, which
 * purges the cached HTML so the new branding is visible on the very NEXT page
 * load for everybody.
 *
 * AUTH — WHY THIS IS NOT JUST A FORWARDED COOKIE
 * ----------------------------------------------
 * The admin session cookie is set on the BACKEND origin with no `domain`
 * attribute, so the browser treats it as host-only. Production runs the
 * frontend and backend on two different `*.vercel.app` registrable domains,
 * which means the browser NEVER sends that cookie to this route. The old
 * cookie-only check therefore returned 401 every time in production and the
 * purge silently never ran.
 *
 * So authorization now accepts (in order):
 *   1. A short-lived, single-purpose revalidation TICKET minted by the backend
 *      on a successful theme write. This route holds no signing key, so it
 *      exchanges the ticket for a yes/no via the backend's
 *      POST /theme/revalidate/authorize endpoint.
 *   2. The legacy forwarded admin cookie — still valid wherever the frontend
 *      and backend share a host (e.g. localhost development), so dev keeps
 *      working with zero extra setup.
 *
 * Purge mechanism (unchanged, deliberately): `revalidatePath("/", "layout")`
 * invalidates every route that renders the root layout — exactly the set
 * affected by the injected theme — and its `_N_T_/layout` implicit tag is what
 * the theme fetch itself carries. ISR is preserved: no `no-store`, no dynamic
 * rendering anywhere in the public read path.
 *
 * Every failure path is logged here so a silent 401 can never hide again.
 */
// Canonical base URL, normalised to always end in "/" (identical to before).
const API_BASE = baseUrl.replace(/\/?$/, "/");

/** Bearer token from the Authorization header, or "". */
const bearerToken = (request: NextRequest): string => {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
};

/** Exchange a backend-minted revalidation ticket for permission to purge. */
async function authorizeWithTicket(ticket: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}theme/revalidate/authorize`, {
    method: "POST",
    headers: { authorization: `Bearer ${ticket}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(
      `[theme/revalidate] ticket authorization rejected (${res.status})`
    );
  }
  return res.ok;
}

/** Legacy same-host fallback: forward the cookie to backend GET /auth/me. */
async function authorizeWithCookie(cookie: string): Promise<boolean> {
  if (!cookie) return false;
  const res = await fetch(`${API_BASE}auth/me`, {
    headers: { cookie, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return false;
  const json = await res.json().catch(() => null);
  const user = json?.data;
  return (
    user?.isAdmin === true ||
    user?.role === "admin" ||
    user?.role === "superadmin"
  );
}

export async function POST(request: NextRequest) {
  let body: { expectedUpdatedAt?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ticket = bearerToken(request);
  let authorized = false;
  let via = "";

  try {
    if (ticket) {
      authorized = await authorizeWithTicket(ticket);
      if (authorized) via = "ticket";
    }
    if (!authorized) {
      authorized = await authorizeWithCookie(request.headers.get("cookie") || "");
      if (authorized) via = "cookie";
    }
  } catch (err) {
    console.error("[theme/revalidate] authorization check failed:", err);
    return NextResponse.json(
      { ok: false, message: "Could not verify the revalidation request" },
      { status: 502 }
    );
  }

  if (!authorized) {
    console.error(
      "[theme/revalidate] denied — no valid revalidation ticket or admin session cookie"
    );
    return NextResponse.json(
      { ok: false, message: "Not authorized to revalidate the theme" },
      { status: 401 }
    );
  }

  // Purge every route that renders the root layout (the themed set).
  revalidatePath("/", "layout");

  // POST-SAVE VERIFICATION
  // Read the theme back through the SAME cached public path a visitor hits and
  // confirm it is the version the Admin just saved. Only then is "live on the
  // storefront" a truthful statement. `updatedAt` changes on every write, so it
  // is a precise equality check for colours, branding AND logo changes alike.
  const expectedUpdatedAt =
    typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  let verified = false;
  let publicUpdatedAt: string | null = null;
  // A couple of short retries absorb the tiny window between marking the tag
  // revalidated and the cache read reflecting it — a false "stale" verdict here
  // would surface an unnecessary warning to the admin.
  for (let attempt = 0; attempt < 3 && !verified; attempt++) {
    try {
      const fresh = await getServerTheme();
      publicUpdatedAt = fresh?.updatedAt ? String(fresh.updatedAt) : null;
      verified = expectedUpdatedAt
        ? publicUpdatedAt === expectedUpdatedAt
        : Boolean(fresh);
    } catch (err) {
      console.error(
        "[theme/revalidate] post-save verification fetch failed:",
        err
      );
    }
    if (!verified && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!verified) {
    console.error(
      `[theme/revalidate] purge ran but the public theme is stale ` +
        `(expected updatedAt=${expectedUpdatedAt || "n/a"}, got=${publicUpdatedAt || "null"})`
    );
  }

  return NextResponse.json({
    ok: true,
    via,
    revalidatedAt: Date.now(),
    verified,
    publicUpdatedAt,
  });
}
