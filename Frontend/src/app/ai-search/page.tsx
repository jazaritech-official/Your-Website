"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import axios, { AxiosError } from "axios";
import ProductCard from "../Components/ProductCard";
import { showToast, baseUrl } from "../utils/commonFunctions";
import { ProductCardSkeleton } from "../Components/PremiumSkeleton";
import { Badge, Button, EmptyState, ErrorState, SectionLabel } from "../Components/ui";
import { SearchX, Sparkles } from "lucide-react";

interface SearchResult {
  products: any[];
  count: number;
  intent: any;
}


const GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";

function SkeletonGrid() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 8 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

function AISearchResultsInner() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<AxiosError | Error | null>(null);

  const fetchSearchResults = async (searchQuery: string) => {
    if (!searchQuery) return;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.post<{ data: SearchResult }>(
        `${baseUrl}product/ai/search-products`, // Fixed endpoint path
        { query: searchQuery },
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" }
        }
      );

      if (res.data?.data?.products) {
        setData(res.data.data);
        showToast(`Found ${res.data.data.count} product(s)`, "success");
      } else {
        showToast("No products found", "info");
        setData(null);
      }
    } catch (err) {
      const axiosError = err as AxiosError;
      setError(axiosError);
      showToast("Error fetching AI search results", "error");
    } finally {
      setLoading(false);
    }
  };

  // Re-run the same request whenever the query parameter changes.
  useEffect(() => {
    fetchSearchResults(query);
  }, [query]);

  if (!query) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon={<SearchX size={26} />}
          title="No search query provided"
          description="Type what you are looking for and our AI will find the closest matches."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:pt-20">
        <div className="mb-8 space-y-3">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-muted" />
          <div className="h-8 w-2/3 animate-pulse rounded bg-surface-muted" />
        </div>
        <SkeletonGrid />
      </div>
    );
  }

  /* A failed request is a failure — it must not masquerade as "no results". */
  if (error) {
    const status = (error as AxiosError)?.response?.status;
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState
          title="Could not load search results"
          message={
            status
              ? `The search service responded with status ${status}.`
              : "We could not reach the search service. Check your connection and try again."
          }
          onRetry={() => fetchSearchResults(query)}
          retryLabel="Retry search"
        />
      </div>
    );
  }

  if (!data || data.products.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon={<SearchX size={26} />}
          title={`No products found for “${query}”`}
          description="Try a broader phrase, or browse the full catalogue."
          action={
            <Button variant="gold" size="md" onClick={() => fetchSearchResults(query)}>
              Search again
            </Button>
          }
        />
      </div>
    );
  }

  const keywords: string[] = Array.isArray(data.intent?.keywords)
    ? data.intent.keywords
    : [];

  return (
    /* Keyed on the query so a NEW search replays the entrance instead of
       silently swapping results under the user. One animated group — the
       product grid itself is never staggered item-by-item. */
    <div
      key={query}
      className="mx-auto max-w-7xl px-4 pb-16 pt-24 ir-fade-in-up sm:pt-20"
    >
      {/* ── Result header ── */}
      <header className="mb-8">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} aria-hidden /> AI matched
          </span>
        </SectionLabel>
        <h1 className="mt-2 break-words text-2xl font-black tracking-tight text-brand-navy sm:text-3xl">
          Results for “{query}”
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-semibold text-brand-navy">{data.count}</span>{" "}
          product{data.count === 1 ? "" : "s"} matched your query.
        </p>

        {(keywords.length > 0 || data.intent?.category) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
              Understood as
            </span>
            {data.intent?.category && (
              <Badge tone="gold" size="md">
                {data.intent.category}
              </Badge>
            )}
            {keywords.map((word: string) => (
              <Badge key={word} tone="neutral" size="md">
                {word}
              </Badge>
            ))}
          </div>
        )}
      </header>

      {/* ── Results ── */}
      <div className={GRID_CLASS}>
        {data.products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button variant="outline" size="md" onClick={() => fetchSearchResults(query)}>
          Refresh results
        </Button>
      </div>
    </div>
  );
}

export default function AISearchResults() {
  return (
    <div className="min-h-screen bg-surface-page">
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:pt-20">
            <SkeletonGrid />
          </div>
        }
      >
        <AISearchResultsInner />
      </Suspense>
    </div>
  );
}