/**
 * Canonical API base URL.
 *
 * Lives in its own module (deliberately WITHOUT "use client") so BOTH server
 * files (sitemap, server-only utils, route handlers) and client components can
 * import the exact same value. Previously this constant was redeclared in 8
 * places; `commonFunctions.tsx` re-exports it for backwards compatibility so
 * every existing import keeps working unchanged.
 *
 * Behaviour is identical to every previous declaration:
 *   process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1/"
 */
export const baseUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1/";
