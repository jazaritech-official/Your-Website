"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { baseUrl, cloudinaryUrl } from "../utils/commonFunctions";

interface RecentProduct {
  _id: string;
  name: string;
  price: number;
  slug: string;
  image: string;
}

const STORAGE_KEY = "irhasinn_recently_viewed";
const MAX_ITEMS = 10;

// Helper functions for localStorage
export function addToRecentlyViewed(product: {
  _id: string;
  name: string;
  price: number;
  slug: string;
  image: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    // Remove if already exists (deduplicate)
    const filtered = stored.filter((p: any) => p._id !== product._id);
    // Add to front
    filtered.unshift(product);
    // Cap at MAX_ITEMS
    const trimmed = filtered.slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) { console.error("[silent-catch RecentlyViewed.tsx]", err); }
}

function getRecentlyViewed(): RecentProduct[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * F-010: session-scope dedupe for check-exist requests.
 * Multiple page mounts (homepage, product detail, navigation) can fire
 * check-exist with the same IDs in quick succession. Module-scope cache
 * with a short TTL avoids repeating the validation unnecessarily.
 * The cache key is the sorted ID set — different ID combinations get
 * their own entry. TTL is 5 minutes; stale entries are simply re-fetched
 * on next mount.
 */
const CHECK_EXIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const checkExistCache = new Map<string, { result: Set<string>; ts: number }>();

async function validateRecentlyViewed(products: RecentProduct[]): Promise<RecentProduct[]> {
  if (products.length === 0) return products;

  const ids = products.map((p) => p._id);
  const cacheKey = [...ids].sort().join(",");
  const now = Date.now();

  // Serve from session-scope cache if still fresh
  const cached = checkExistCache.get(cacheKey);
  if (cached && now - cached.ts < CHECK_EXIST_CACHE_TTL) {
    const valid = products.filter((p) => cached.result.has(p._id));
    return valid;
  }

  try {
    const res = await fetch(`${baseUrl}product/check-exist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) return products; // on error, show cached data as-is

    const json = await res.json();
    const existingIds: string[] = json?.data ?? [];
    const existingSet = new Set(existingIds);

    // Populate session-scope cache
    checkExistCache.set(cacheKey, { result: existingSet, ts: now });

    const valid = products.filter((p) => existingSet.has(p._id));

    // Update localStorage if any stale entries were removed
    if (valid.length < products.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } catch (err) { console.error("[silent-catch RecentlyViewed.tsx]", err); }
    }

    return valid;
  } catch {
    return products; // network error — show cached data as-is
  }
}

export default function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const [items, setItems] = useState<RecentProduct[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let all = getRecentlyViewed();

      // Validate against database — filter out deleted products
      all = await validateRecentlyViewed(all);

      if (cancelled) return;

      // Exclude the current product if specified
      const filtered = excludeId
        ? all.filter((p) => p._id !== excludeId)
        : all;
      setItems(filtered);
    };

    load();
    return () => { cancelled = true; };
  }, [excludeId, pathname]);

  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-5">
        <h2 className="text-lg font-black tracking-tight text-brand-navy sm:text-xl">
          Recently Viewed
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Products you&apos;ve checked out recently
        </p>
      </div>

      {/* `hide-scrollbar` is the class actually defined in globals.css — this
          scroller previously used `scrollbar-hide`, which no stylesheet in the
          project defines (no scrollbar-hide plugin is installed), so the bar
          was always visible. The old `-mx-3 px-3` negative-margin bleed was
          also removed: the parent already supplies the gutter. */}
      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar snap-x">
        {items.map((product) => (
          /* <Link> instead of a raw <a href>: the raw anchor forced a full
             document reload (dropping SPA navigation and re-fetching the whole
             storefront) every time a card was clicked. */
          <Link
            key={product._id}
            href={`/product/${product._id}`}
            className="group w-36 flex-shrink-0 snap-start sm:w-40"
          >
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-card-hover">
              <div className="relative aspect-square overflow-hidden bg-surface-muted">
                <img
                  src={cloudinaryUrl(product.image, 600) || "/carousel/Clothes.jpg"}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="p-2.5">
                <h3 className="truncate text-xs font-bold text-brand-navy">
                  {product.name}
                </h3>
                <p className="mt-0.5 text-xs font-black text-brand-gold-hover">
                  {formatPKR(product.price)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
