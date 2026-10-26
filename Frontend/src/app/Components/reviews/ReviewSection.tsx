"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Loader2 } from "lucide-react";
import { baseUrl } from "@/app/utils/commonFunctions";
import axios from "axios";
import ReviewSummary, { type RatingSummary } from "./ReviewSummary";
import ReviewForm, { type ExistingReview } from "./ReviewForm";
import ReviewCard, { type ReviewData } from "./ReviewCard";

/* ============================================================
   REVIEW SECTION — Complete review experience for product pages
   
   Combines:
   - Rating summary with distribution bars
   - Review submission form
   - Filter controls (All, 5-1, Verified)
   - Sort controls (Helpful, Newest, Highest, Lowest)
   - Paginated review list
   ============================================================ */

type SortKey = "helpful" | "newest" | "highest" | "lowest" | "verified";

export default function ReviewSection({
  productId,
  currentUserId,
  isAuthenticated,
}: {
  productId: string;
  currentUserId?: string | null;
  isAuthenticated: boolean;
}) {
  const [summary, setSummary] = useState<RatingSummary>({
    averageRating: 0,
    totalReviews: 0,
    distribution: {},
  });
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [userReview, setUserReview] = useState<ExistingReview | null>(null);
  const [hasVerifiedPurchase, setHasVerifiedPurchase] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [activeFilter, setActiveFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("helpful");

  const limit = 10;

  const fetchReviews = useCallback(
    async (pageNum: number, append = false) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(limit),
          sort: sortBy,
        });
        if (activeFilter) params.set("rating", String(activeFilter));

        const res = await axios.get(
          `${baseUrl}reviews/product/${productId}?${params}`,
          { withCredentials: true }
        );
        const data = res.data?.data || {};

        setSummary(data.summary || summary);
        setUserReview(data.userReview || null);
        setHasVerifiedPurchase(data.hasVerifiedPurchase || false);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);

        if (append) {
          setReviews((prev) => [...prev, ...(data.reviews || [])]);
        } else {
          setReviews(data.reviews || []);
        }
      } catch {
        // Reviews may not be available
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [productId, sortBy, activeFilter]
  );

  // Reset and fetch on filter/sort change
  useEffect(() => {
    setPage(1);
    fetchReviews(1, false);
  }, [fetchReviews]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchReviews(next, true);
  };

  const handleFilterChange = (rating: number | null) => {
    setActiveFilter(rating);
  };

  const handleReviewSuccess = () => {
    fetchReviews(1, false);
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm sm:mt-12 sm:rounded-[32px] sm:p-8 sm:shadow-[0_20px_70px_rgba(0,0,0,0.08)]">
      {/* Section header */}
      <div className="mb-5 flex items-center gap-2 sm:mb-8 sm:gap-3">
        <MessageSquare size={18} className="text-slate-900 sm:h-6 sm:w-6" />
        <h2 className="text-lg font-black text-slate-900 sm:text-2xl">
          Customer Reviews
        </h2>
        {total > 0 && (
          <span className="ml-auto text-xs text-slate-500 sm:text-sm">
            {total} review{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-brand-gold" />
        </div>
      ) : (
        <>
          {/* Rating Summary */}
          {summary.totalReviews > 0 && (
            <div className="mb-6 sm:mb-8">
              <ReviewSummary
                summary={summary}
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
              />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Review Form */}
          <div className="my-6 sm:my-8">
            {isAuthenticated ? (
              <ReviewForm
                productId={productId}
                existingReview={userReview}
                verifiedPurchase={hasVerifiedPurchase}
                onSuccess={handleReviewSuccess}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <p className="text-sm text-slate-500">
                  Please{" "}
                  <a href="/" className="font-semibold text-brand-gold hover:underline">
                    log in
                  </a>{" "}
                  to write a review.
                </p>
              </div>
            )}
          </div>

          {/* Sort controls */}
          {reviews.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(
                [
                  { key: "helpful", label: "Most Helpful" },
                  { key: "newest", label: "Newest" },
                  { key: "highest", label: "Highest" },
                  { key: "lowest", label: "Lowest" },
                  { key: "verified", label: "Verified" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    sortBy === opt.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Review list */}
          {reviews.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-slate-500">
                {activeFilter
                  ? "No reviews match this filter."
                  : "No reviews yet."}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {activeFilter
                  ? "Try selecting a different rating."
                  : "Be the first to share your experience."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {reviews.map((review) => (
                  <ReviewCard
                    key={review._id}
                    review={review}
                    currentUserId={currentUserId}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Load more */}
          {page < totalPages && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Load More Reviews
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
