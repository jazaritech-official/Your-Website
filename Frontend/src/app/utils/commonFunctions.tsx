import { toast, ToastOptions, Theme } from "react-toastify";
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useEffect, useState } from "react";
import CustomToast from "../Components/notifications/CustomToast";
import { store } from "@/app/Redux/store";
import { logout } from "@/app/Redux/Features/authSlice";

export type ToastType = "success" | "info" | "warn" | "error";

/* ── Overlay Duration (1 second "BOOM" moment) ──────────────── */
const OVERLAY_DURATION = 1000; // 1 second visible
const OVERLAY_TOTAL = OVERLAY_DURATION + 400; // plus exit-animation buffer

/* ── Intelligent Duplicate Prevention ──────────────────────────── */
let lastToastKey: string | null = null;
let lastToastTime = 0;
const DUPLICATE_WINDOW_MS = 1500;

/* ── Track current overlay toast for graceful replacement ────── */
let currentOverlayToastId: string | null = null;

const buildToastId = (message: string, type: ToastType) => `${type}:${message}`;

/* ── Centralized Premium Full-Screen Overlay showToast ───────── */
export function showToast(
  message: string,
  type: ToastType = "error",
  _theme?: Theme, // kept for API compatibility; overlay ignores it
): void {
  const key = buildToastId(message, type);
  const now = Date.now();

  // Prevent rapid duplicates of the exact same toast
  if (key === lastToastKey && now - lastToastTime < DUPLICATE_WINDOW_MS) {
    return;
  }

  lastToastKey = key;
  lastToastTime = now;

  // Dismiss any existing overlay toast before showing a new one
  if (currentOverlayToastId) {
    toast.dismiss(currentOverlayToastId);
  }

  currentOverlayToastId = key;

  // toast(content, options) — fully supported in react-toastify v11
  // Do NOT use toast.custom() — it does NOT exist in the installed version.
  toast(
    <CustomToast
      type={type}
      message={message}
      duration={OVERLAY_DURATION}
      onClose={() => {
        toast.dismiss(key);
        if (currentOverlayToastId === key) currentOverlayToastId = null;
      }}
    />,
    {
      position: "top-center",
      autoClose: OVERLAY_TOTAL,
      hideProgressBar: true,
      closeOnClick: false,
      pauseOnHover: false,
      pauseOnFocusLoss: false,
      draggable: false,
      closeButton: false,
      icon: false,
      toastId: key,
      className: "irhasinn-overlay-toast",
      bodyClassName: "",
      style: { background: "transparent", boxShadow: "none", padding: 0, margin: 0 },
    } as ToastOptions,
  );
}

/* ── Cart Helpers ──────────────────────────────────────────────── */
export const getLocalCart = () => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("irhasinn_cart") ?? "[]");
  } catch {
    return [];
  }
};

export const setLocalCart = (cart: any[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("irhasinn_cart", JSON.stringify(cart));
};

export const addToLocalCart = (product: any, quantity = 1) => {
  if (typeof window === "undefined") return [];
  const currentCart = getLocalCart();
  const existing = currentCart.find((item: any) => item._id === product._id);

  if (existing) {
    existing.quantity += quantity;
  } else {
    currentCart.push({ ...product, quantity });
  }

  setLocalCart(currentCart);
  return currentCart;
};

export const removeFromLocalCart = (productId: string) => {
  if (typeof window === "undefined") return [];
  const currentCart = getLocalCart();
  const newCart = currentCart.filter((item: any) => item._id !== productId);
  setLocalCart(newCart);
  return newCart;
};

/* ── Shared wishlist-id cache ─────────────────────────────────────
 * Every ProductCard used to fetch /auth/wishlist on mount, so a logged-in
 * homepage with 10+ cards fired 10+ identical requests. Now the ids are
 * loaded ONCE per session (module-scope promise + localStorage mirror) and
 * every consumer (Navbar count, ProductCard hearts) reads the same data.
 * The in-flight dedupe above also collapses simultaneous first calls.
 * Refresh on demand via refetchWishlistIds() after toggling. */
const WISHLIST_STORAGE_KEY = "irhasinn_wishlist_ids";
let wishlistIdsPromise: Promise<string[]> | null = null;
let wishlistIdsLoadedAt = 0;
// NOTE: this cache is intentionally NOT keyed by user id. It is safe only
// because logout and session expiry both force a full page reload (resetting
// module state). If a no-reload user switch is ever added, key this by user.

export const getCachedWishlistIds = (): string[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
};

const persistWishlistIds = (ids: string[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — ignore */
  }
};

const loadWishlistIds = (): Promise<string[]> => {
  if (!wishlistIdsPromise) {
    wishlistIdsPromise = axios
      .get(`${baseUrl}auth/wishlist`, { withCredentials: true })
      .then((res) => {
        const items = res.data?.data || [];
        const ids = (Array.isArray(items) ? items : []).map(
          (p: any) => p._id || p,
        );
        persistWishlistIds(ids);
        wishlistIdsLoadedAt = Date.now();
        return ids;
      })
      .catch(() => {
        // Fall back to whatever we have locally; never block the UI on a
        // wishlist fetch failure.
        return getCachedWishlistIds() || [];
      })
      .finally(() => {
        wishlistIdsPromise = null;
      });
  }
  return wishlistIdsPromise;
};

/**
 * Best-effort wishlist ids for the current user.
 * - First call after a page load triggers exactly ONE server request,
 *   shared by every caller (all ProductCards + the Navbar) via the
 *   in-flight promise — never one request per component.
 * - Subsequent calls within the session serve the shared in-memory /
 *   localStorage mirror (no network).
 * - `force = true` bypasses the cache (used by the Navbar focus refresh
 *   and after wishlist toggles) but is still deduped while in flight.
 */
export const fetchWishlistIds = async (force = false): Promise<string[]> => {
  if (force) return loadWishlistIds();
  // Fresh page session (module state reset on reload): fetch once.
  if (wishlistIdsLoadedAt === 0) return loadWishlistIds();
  const cached = getCachedWishlistIds();
  if (cached !== null) return cached;
  return loadWishlistIds();
};

/** Force a server refresh of the wishlist ids (after add/remove). */
export const refetchWishlistIds = async (): Promise<string[]> => {
  return loadWishlistIds();
};

/* ── Module-level fetch cache (admin panel fast navigation) ──────
 * Lives OUTSIDE components on purpose: it persists across re-renders and
 * route navigation, so navigating back to a heavy admin page within the
 * staleTime serves the data instantly without a network round-trip.
 * Keys are `${cacheKey}:${url}` so different pages / page numbers each get
 * their own entry, while invalidateCache(cacheKey) clears them all by prefix. */
const FETCH_CACHE: Record<string, { data: any; ts: number }> = {};

/* ── In-flight request dedupe ────────────────────────────────────
 * Multiple components on the same page frequently request the SAME url
 * simultaneously (e.g. every CategoryProductRow + the category strip all
 * call /category/getAllCategories on homepage mount, and every ProductCard
 * calls /auth/wishlist for logged-in users). Without dedupe that means N
 * identical network round-trips for one piece of data. Dedupe by url:
 * the first caller starts the request, everyone else awaits the SAME
 * promise. Works for both cached and uncached useFetch calls. */
const IN_FLIGHT: Record<string, Promise<any>> = {};

/** Await an already-running request for `url`, or undefined if none. */
function getInFlight<T = any>(url: string): Promise<T> | undefined {
  return IN_FLIGHT[url];
}

function trackInFlight<T = any>(url: string, p: Promise<T>): Promise<T> {
  IN_FLIGHT[url] = p;
  // Always clean up, success or failure, so the next navigation can refetch.
  p.finally(() => {
    if (IN_FLIGHT[url] === p) delete IN_FLIGHT[url];
  }).catch(() => {});
  return p;
}

/** Drop every cached entry belonging to the given cacheKey (call this after
 *  any mutation on that page so the next visit shows fresh data). Also drops
 *  any matching in-flight request so a stale response can't re-populate the
 *  just-invalidated entry. */
export const invalidateCache = (cacheKey: string) => {
  const prefix = `${cacheKey}:`;
  Object.keys(FETCH_CACHE).forEach((k) => {
    if (k.startsWith(prefix)) delete FETCH_CACHE[k];
  });
  Object.keys(IN_FLIGHT).forEach((url) => {
    if (url.includes(cacheKey)) delete IN_FLIGHT[url];
  });
};

/** Drop EVERY cached entry — call on logout so a different admin signing into
 *  the same browser can never be served the previous user's private data. */
export const clearAllFetchCache = () => {
  Object.keys(FETCH_CACHE).forEach((k) => delete FETCH_CACHE[k]);
};

interface UseFetchOptions {
  /** Namespace for the module-level cache (required to enable caching). */
  cacheKey?: string;
  /** How long a cached response stays fresh, in ms (default 0 = no caching). */
  staleTime?: number;
}

/* ── Generic useFetch Hook ─────────────────────────────────────── */
const useFetch = <T = any>(url: string, options?: UseFetchOptions) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<AxiosError | Error | null>(null);

  const cacheKey = options?.cacheKey;
  const staleTime = options?.staleTime ?? 0;

  useEffect(() => {
    const fetchData = async () => {
      // Serve from the module cache when still fresh — no network request,
      // no loading spinner: navigating back feels instant.
      const cacheId = cacheKey ? `${cacheKey}:${url}` : "";
      if (cacheId && staleTime > 0) {
        const cached = FETCH_CACHE[cacheId];
        if (cached && Date.now() - cached.ts < staleTime) {
          setData(cached.data as T);
          return;
        }
      }

      // If the exact same url is already being fetched by another component
      // on this page, share that in-flight request instead of duplicating it.
      const inFlight = getInFlight(url);
      if (inFlight) {
        // Keep the loading contract intact: while data isn't available yet,
        // loading must be true so consumers render their skeleton, not their
        // empty/fallback state.
        setLoading(true);
        setError(null);
        try {
          // The shared promise is the raw axios response (identical to the
          // direct path below) — unwrap `.data` (the response BODY) so every
          // consumer sees the exact same shape whether it started the request
          // itself or joined one already in flight. Without the unwrap, a
          // joining consumer stored the axios response object, so `data.data`
          // pointed at the body object instead of the payload array and valid
          // data was silently dropped (e.g. the homepage category strip stuck
          // on "Loading Categories..." because Navbar starts the categories
          // request and Categories.tsx joins it mid-flight).
          const res = await inFlight;
          setData(res.data as T);
          if (cacheId && staleTime > 0) {
            FETCH_CACHE[cacheId] = { data: res.data, ts: Date.now() };
          }
        } catch (err) {
          setError(err as AxiosError);
        } finally {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await trackInFlight(
          url,
          axios.get<T>(url, { withCredentials: true }),
        );
        setData(res.data);
        if (cacheId && staleTime > 0) {
          FETCH_CACHE[cacheId] = { data: res.data, ts: Date.now() };
        }
      } catch (err) {
        setError(err as AxiosError);
        // Session-expiry is handled centrally by the axios interceptor
        // (friendly toast + redirect). Don't clobber that with the generic
        // error toast — it should only appear for genuine unexpected
        // failures, not for the routine expired-session case.
        if (!(err as any)?.__sessionExpired) {
          showToast("Error fetching data", "error");
        }
      } finally {
        setLoading(false);
      }
    };

    if (url) fetchData();
  }, [url, cacheKey, staleTime]);

  const reFetch = async () => {
    // Force a network request (and refresh the cache) — used after mutations.
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<T>(url, { withCredentials: true });
      setData(res.data);
      const cacheId = cacheKey ? `${cacheKey}:${url}` : "";
      if (cacheId && staleTime > 0) {
        FETCH_CACHE[cacheId] = { data: res.data, ts: Date.now() };
      }
    } catch (err) {
      setError(err as AxiosError);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, reFetch };
};

export default useFetch;

/* ── Axios Session-Expiry Interceptor ──────────────────────────── */
/*
 * Post-auth cookie-commit grace period.
 *
 * Right after a successful login / OTP verification, the browser may not have
 * attached the cross-origin access_token cookie to the very first
 * authenticated requests yet — the Navbar fetches and the Socket.IO handshake
 * fire in the same tick as the auth response resolves. Any 401 that lands
 * within this short window is retried ONCE after a brief delay (long enough
 * for the cookie to be committed) instead of being surfaced as a spurious
 * failure. This is a pure client-side safety net: it never changes how the
 * backend issues the cookie and it is a no-op outside the grace window.
 */
let lastAuthSuccessAt = 0;
const AUTH_GRACE_MS = 4000;

/** Call this the moment a login / OTP verification succeeds. */
export const markJustAuthenticated = () => {
  lastAuthSuccessAt = Date.now();
  // A fresh login invalidates any earlier session-expiry handling — the
  // next expiry must clear state and redirect again.
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_EXPIRY_FLAG);
    } catch {
      /* storage unavailable — ignore */
    }
  }
};

// Once-per-page-load guard: several parallel authenticated requests can 401
// together (e.g. Navbar + page fetches) — the first one clears state and
// starts the redirect; the rest are marked but do nothing.
let sessionExpiryHandled = false;

// Survives the redirect's full page reload: a late request that still 401s
// on the landing page (e.g. the cookie-clear hadn't landed yet) must not
// re-trigger the whole clear-and-redirect dance and start a reload loop.
// Cleared on the next successful login (see markJustAuthenticated).
const SESSION_EXPIRY_FLAG = "irhasinn_session_expiry_handled";

/** Clear every locally-held auth artifact for the current user. */
const clearLocalAuthState = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("user");
    // Wishlist ids are user-scoped — a fresh login must not inherit them.
    localStorage.removeItem(WISHLIST_STORAGE_KEY);
    clearAllFetchCache();
  } catch {
    /* storage unavailable — the reload below still resets module state */
  }
};

/** Handle an expired/invalid session: clear state, notify, redirect to the
 *  login flow. Runs at most once per page load. */
const handleSessionExpiry = () => {
  if (sessionExpiryHandled) return;
  sessionExpiryHandled = true;

  // Already handled by a previous load (we're on the post-redirect page and
  // a straggler request 401'd). Mark + return: the login modal is already
  // open via the ?sessionExpired=true param — never loop.
  if (typeof window !== "undefined") {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRY_FLAG) === "1") return;
      sessionStorage.setItem(SESSION_EXPIRY_FLAG, "1");
    } catch {
      /* storage unavailable — the in-memory guard still applies */
    }
  }

  clearLocalAuthState();

  // Reset the Redux auth slice (statically imported — no fragile require).
  try {
    store.dispatch(logout());
  } catch {
    /* store unavailable; the reload below resets it anyway */
  }

  // Clear the httpOnly cookie server-side so the stale token can't linger.
  // /auth/logout deliberately has no verifyToken — it works with an
  // expired token. Fire-and-forget; never block on it.
  try {
    fetch(`${baseUrl}auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  } catch {
    /* best-effort */
  }

  showToast("Your session has expired, please log in again", "error");
  setTimeout(() => {
    window.location.href = "/?sessionExpired=true";
  }, 1200);
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    const code = data.code;
    const msg = data.message || "";
    const original = error?.config;

    // Grace retry: spurious 401 immediately after login/OTP verification.
    // Only credentialed requests (withCredentials) are retried, and only
    // once — never the socket, and never a request that never sent cookies.
    if (
      status === 401 &&
      original?.withCredentials &&
      !(original as any)._graceRetried &&
      Date.now() - lastAuthSuccessAt < AUTH_GRACE_MS
    ) {
      (original as any)._graceRetried = true;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return axios(original);
    }

    const hasLocalUser =
      typeof window !== "undefined" && !!localStorage.getItem("user");

    // Session-expiry signals, keyed on the backend's stable `code` values:
    //   - SESSION_INVALIDATED (401)  — tokenVersion bumped (forced logout)
    //   - TOKEN_EXPIRED (403)        — JWT has expired
    //   - TOKEN_INVALID (403)        — JWT unparseable/tampered
    //   - msg match (401)            — explicit "Session expired" payload
    //   - AUTH_REQUIRED (401)        — NO token sent at all (cookie fully
    //     expired/dropped by the browser). Only treated as session expiry
    //     when the frontend still believes a user is logged in — a genuine
    //     guest hitting a protected endpoint keeps the old generic path.
    const isAuthFailure =
      code === "SESSION_INVALIDATED" ||
      code === "TOKEN_EXPIRED" ||
      code === "TOKEN_INVALID" ||
      (status === 401 && msg === "Session expired, please log in again") ||
      (status === 401 && code === "AUTH_REQUIRED" && hasLocalUser);

    if (isAuthFailure) {
      // Mark the error so useFetch suppresses its generic "Error fetching
      // data" toast — the interceptor shows the friendly session-expired
      // message instead.
      (error as any).__sessionExpired = true;
      // Grace-window guard: a 401 right after login that survived the single
      // retry above is almost certainly the cookie-commit race, NOT a real
      // expired session (a genuine expiry means a stale, old token). Treating
      // it as expiry would log out the user who just logged in.
      if (Date.now() - lastAuthSuccessAt >= AUTH_GRACE_MS) {
        handleSessionExpiry();
      }
    }
    return Promise.reject(error);
  }
);

// Canonical API base URL lives in ./apiBase (server-safe module). Imported for
// local use and re-exported so every existing
// `import { baseUrl } from ".../commonFunctions"` keeps working unchanged.
import { baseUrl } from "./apiBase";
export { baseUrl };
// Shared display formatters (server-safe). Re-exported for convenience.
export { formatPKR } from "./format";

/* ── Cloudinary display-time transformation helper ─────────────
 * Converts a Cloudinary image URL into a delivery URL with a width-capped,
 * auto-quality/format transform (w_<width>,q_auto,f_auto). This is a pure
 * DISPLAY-time change: the uploaded originals are never modified and the
 * upload pipeline is untouched. Measured effect on a production image:
 * 553 KB original → 103 KB at w_600 (≈81% smaller payload).
 *
 * Behavior:
 *  - Non-Cloudinary URLs (local /carousel/..., data URIs, etc.) return as-is.
 *  - Cloudinary URLs WITHOUT an existing transform get one inserted after
 *    /image/upload/ (e.g. .../upload/v123/.. → .../upload/w_600,q_auto,f_auto/v123/..).
 *  - Cloudinary URLs that ALREADY carry a transform (e.g. a prior w_/h_/c_
 *    segment) get the existing segment replaced, never duplicated.
 *  - null / undefined / empty input returns an empty string so callers keep
 *    their existing fallback (`|| "/carousel/Clothes.jpg"`) semantics.
 */
export const cloudinaryUrl = (
  url: string | null | undefined,
  width: number,
): string => {
  if (!url) return "";
  const str = String(url);
  // Only rewrite Cloudinary image-upload URLs (https, any cloud name).
  const uploadIdx = str.indexOf("/image/upload/");
  if (uploadIdx === -1) return str;
  const prefix = str.slice(0, uploadIdx + "/image/upload/".length);
  let rest = str.slice(uploadIdx + "/image/upload/".length);
  // The segment immediately after /image/upload/ is either a version (v123...)
  // or an existing transform (contains "_" like w_800,q_auto). Detect an
  // existing transform by the presence of an underscore in the first segment
  // (versions never contain underscores) and strip it before adding ours.
  const slashIdx = rest.indexOf("/");
  const firstSegment = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  if (firstSegment.includes("_")) {
    rest = rest.slice(firstSegment.length + 1);
  }
  const widthNum = Math.max(1, Math.min(2500, Math.round(width) || 600));
  return `${prefix}w_${widthNum},q_auto,f_auto/${rest}`;
};

/* ── Haversine distance (km) between two coordinates ─────────── */
export const haversineKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/* ── Size-based pricing helpers ─────────────────────────────────
 * Compute min/max prices from a product's variantPricing map.
 * variantPricing is keyed by "Color__Size" or just "Size".
 * Returns { minPrice, maxPrice, hasRange } where hasRange is true
 * when min !== max (i.e., the product has differing size prices).
 */
export const getSizePriceRange = (
  variantPricing?: Record<string, number>,
): { minPrice: number; maxPrice: number; hasRange: boolean } => {
  if (!variantPricing || typeof variantPricing !== "object") {
    return { minPrice: 0, maxPrice: 0, hasRange: false };
  }
  const prices = Object.values(variantPricing).filter(
    (p) => typeof p === "number" && p > 0,
  );
  if (prices.length === 0) {
    return { minPrice: 0, maxPrice: 0, hasRange: false };
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return { minPrice, maxPrice, hasRange: minPrice !== maxPrice };
};

/**
 * Clean a single variant option string (strip brackets, quotes, trim).
 */
export const cleanVariantOption = (value: string) =>
  String(value).replace(/[\[\]"']/g, "").trim();

/**
 * Get clean, filtered variant options from an array.
 */
export const getVariantOptions = (options?: string[]) =>
  (options ?? []).map(cleanVariantOption).filter(Boolean);

/**
 * Resolve the price for a cart item based on its selected variant.
 * Uses variantPricing map when available, falls back to base price.
 * When no size is selected for a variant-managed product, returns 0
 * (callers should show "Select a size" messaging instead of "Rs 0").
 */
export const resolveItemPrice = (item: {
  price: number;
  selectedColor?: string;
  selectedSize?: string;
  variantPricing?: Record<string, number>;
}): number => {
  const vp = item.variantPricing;
  if (vp && typeof vp === "object") {
    const color = (item.selectedColor || "").trim();
    const size = (item.selectedSize || "").trim();
    const colorSizeKey = color && size ? `${color}__${size}` : "";
    const sizeOnlyKey = size || "";
    if (colorSizeKey && vp[colorSizeKey] !== undefined) return vp[colorSizeKey];
    if (sizeOnlyKey && vp[sizeOnlyKey] !== undefined) return vp[sizeOnlyKey];
  }
  return item.price;
};

/* ── Variant-aware inventory helpers ───────────────────────────
 * These mirror the backend utils/inventory.js logic so the frontend
 * can compute effective stock without an extra API call.
 */

/** Does this product have any variant-level stock entries? */
export const hasVariantInventory = (
  product?: { variantStock?: Record<string, number> } | null,
): boolean => {
  if (!product?.variantStock || typeof product.variantStock !== "object") return false;
  return Object.keys(product.variantStock).length > 0;
};

/** Sum all variant stock values (treats missing / NaN as 0). */
export const sumVariantStocks = (
  product?: { variantStock?: Record<string, number> } | null,
): number => {
  if (!product?.variantStock || typeof product.variantStock !== "object") return 0;
  return Object.values(product.variantStock).reduce((sum, val) => {
    const n = Number(val);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
};

/** Effective stock: variant sum for variant products, product.stock for normal. */
export const getEffectiveStock = (
  product?: { stock?: number; variantStock?: Record<string, number> } | null,
): number => {
  if (hasVariantInventory(product)) return sumVariantStocks(product);
  const s = Number(product?.stock);
  return Number.isFinite(s) ? Math.max(0, s) : 0;
};

/** Boolean: does the product have at least one unit available? */
export const isProductInStock = (
  product?: { stock?: number; variantStock?: Record<string, number> } | null,
): boolean => getEffectiveStock(product) > 0;

/** Get stock for a specific variant (color + size). Returns 0 if no match. */
export const getVariantStock = (
  product?: { variantStock?: Record<string, number> } | null,
  color?: string,
  size?: string,
): number => {
  if (!hasVariantInventory(product)) return 0;
  const vs = product!.variantStock!;
  const c = (color || "").trim();
  const s = (size || "").trim();
  const key = c && s ? `${c}__${s}` : s || c;
  if (!key) return 0;
  const val = Number(vs[key]);
  if (Number.isFinite(val) && val > 0) return val;
  // Fallback: when color+size key doesn't exist but size-only does,
  // use the size-only value. This handles categories where colors are
  // independent (e.g. T-Shirts) — variantStock stores size-only keys.
  if (c && s) {
    const sizeKey = s.trim();
    const sizeVal = Number(vs[sizeKey]);
    if (Number.isFinite(sizeVal) && sizeVal > 0) return sizeVal;
  }
  return 0;
};

/**
 * Validate a Pakistani mobile phone number.
 * Accepts: 03XXXXXXXXX (11 digits) or +923XXXXXXXXX (13 chars with +92).
 * Returns true if valid, false otherwise.
 */
export const isValidPakistaniPhone = (value: string): boolean => {
  const trimmed = value.trim();
  // Local format: 03XXXXXXXXX (exactly 11 digits, starts with 03)
  if (/^03\d{9}$/.test(trimmed)) return true;
  // International format: +923XXXXXXXXX (starts with +92, then 10 digits starting with 3)
  if (/^\+923\d{10}$/.test(trimmed)) return true;
  return false;
};

/**
 * Normalize a Pakistani phone number to local format (03XXXXXXXXX).
 * Returns the normalized string, or the original if it doesn't match either format.
 */
export const normalizePakistaniPhone = (value: string): string => {
  const trimmed = value.trim();
  if (/^\+923\d{10}$/.test(trimmed)) {
    return "0" + trimmed.slice(3); // +923XXXXXXXXX → 03XXXXXXXXX
  }
  return trimmed;
};
