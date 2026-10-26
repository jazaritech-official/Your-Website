import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Store } from "lucide-react";
import { baseUrl } from "../utils/apiBase";

/**
 * /store — showcase directory.
 * Lists every PUBLISHED brand showcase (served by the public endpoint),
 * so multiple client storefronts are reachable from one index. An empty
 * store shows an honest empty state — no fabricated demo entries.
 */

export const metadata: Metadata = {
  title: "Brand Showcases",
  description: "Published brand storefronts prepared with the Jazari Tech showcase studio.",
  robots: { index: false, follow: true }, // directory itself stays out of search
};

interface ShowcaseListItem {
  slug: string;
  name: string;
  brandName: string;
  tagline: string;
  logoUrl: string;
  industry: string;
}

async function fetchShowcases(): Promise<ShowcaseListItem[]> {
  try {
    const res = await fetch(`${baseUrl}brand-profiles/public`, {
      headers: { accept: "application/json" },
      next: { revalidate: 300, tags: ["showcase-list"] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return [];
  }
}

export default async function ShowcaseIndexPage() {
  const showcases = await fetchShowcases();

  return (
    <main className="mx-auto min-h-[60vh] w-full max-w-6xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">
          Brand Showcases
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink-muted">
          Independently branded storefronts prepared on the Jazari Tech platform.
        </p>
      </div>

      {showcases.length === 0 ? (
        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-dashed border-line bg-surface-muted/50 px-6 py-12 text-center">
          <Store size={26} className="mx-auto text-ink-subtle" />
          <p className="mt-3 text-sm font-semibold text-ink">No published showcases yet</p>
          <p className="mt-1 text-xs text-ink-muted">
            Published brand profiles from the Showcase Studio will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showcases.map((s) => (
            <Link
              key={s.slug}
              href={`/store/${s.slug}`}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              {s.logoUrl ? (
                <Image
                  src={s.logoUrl}
                  alt={s.brandName}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-xl border border-line object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-lg font-black text-brand-gold">
                  {(s.brandName || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-ink group-hover:text-brand-gold-hover">
                  {s.brandName}
                </p>
                {s.tagline && <p className="truncate text-xs text-ink-muted">{s.tagline}</p>}
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  /store/{s.slug}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
