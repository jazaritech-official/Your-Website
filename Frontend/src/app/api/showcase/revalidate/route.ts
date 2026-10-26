import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { baseUrl } from "@/app/utils/apiBase";

/**
 * On-demand showcase revalidation (F-07).
 *
 * /store and /store/[slug] are ISR pages (fetch `revalidate: 300` with tags
 * `showcase-<slug>` for one storefront and `showcase-list` for the /store
 * directory). TTL alone would mean a publish/archive/unarchive takes up to
 * 5 minutes to appear, so the BACKEND calls this route server-to-server
 * right after those mutations and this route purges both tags.
 *
 * AUTH — same shared-secret/ticket pattern as /api/theme/revalidate:
 * this route holds NO signing key. The backend mints a short-lived ticket
 * signed with a DERIVED key (JWT + showcase-revalidate suffix, scoped
 * "showcase:revalidate") and sends it as a Bearer token; we exchange it at
 * the backend's POST /brand-profiles/revalidate/authorize for a yes/no.
 * A plain access token or a theme-scoped ticket is rejected there.
 *
 * A legacy forwarded admin cookie is still accepted as a fallback so the
 * same route works on localhost where frontend and backend share a host.
 *
 * A purge failure here is never fatal for the caller — the ISR TTL remains
 * the backstop — but every denial is logged so a silent 401 can't hide.
 */
const API_BASE = baseUrl.replace(/\/?$/, "/");

/** Showcase slugs are lowercase url-safe slugs — rejects tag injection. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Bearer token from the Authorization header, or "". */
const bearerToken = (request: NextRequest): string => {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
};

/** Exchange a backend-minted showcase revalidation ticket for permission. */
async function authorizeWithTicket(ticket: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}brand-profiles/revalidate/authorize`, {
    method: "POST",
    headers: { authorization: `Bearer ${ticket}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(
      `[showcase/revalidate] ticket authorization rejected (${res.status})`
    );
  }
  return res.ok;
}

/** Legacy same-host fallback: forward the cookie to backend GET /auth/me. */
async function authorizeWithCookie(cookie: string): Promise<boolean> {
  if (!cookie) return false;
  try {
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
  } catch (err) {
    console.error("[showcase/revalidate] cookie authorization failed:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: { slug?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!slug || !SLUG_RE.test(slug) || slug.length > 60) {
    return NextResponse.json(
      { ok: false, message: "A valid showcase slug is required" },
      { status: 400 }
    );
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
    console.error("[showcase/revalidate] authorization check failed:", err);
    return NextResponse.json(
      { ok: false, message: "Could not verify the revalidation request" },
      { status: 502 }
    );
  }

  if (!authorized) {
    console.error(
      "[showcase/revalidate] denied — no valid showcase revalidation ticket or admin session cookie"
    );
    return NextResponse.json(
      { ok: false, message: "Not authorized to revalidate showcases" },
      { status: 401 }
    );
  }

  // Purge the storefront directory + this storefront's tagged ISR data.
  // Profile "max" = immediate expiration (Next 16's two-arg signature).
  revalidateTag("showcase-list", "max");
  revalidateTag(`showcase-${slug}`, "max");

  return NextResponse.json({
    ok: true,
    via,
    tags: ["showcase-list", `showcase-${slug}`],
    revalidatedAt: Date.now(),
  });
}
