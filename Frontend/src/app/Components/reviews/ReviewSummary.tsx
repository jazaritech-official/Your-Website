"use client";

import { motion } from "framer-motion";
import { StarDisplay } from "./StarRating";

/* ============================================================
   REVIEW SUMMARY — Rating overview with distribution bars
   
   Shows: average rating, total reviews, distribution bars.
   ============================================================ */

export interface RatingSummary {
  averageRating: number;
  totalReviews: number;
  distribution: Record<string, number>;
}

export default function ReviewSummary({
  summary,
  activeFilter,
  onFilterChange,
}: {
  summary: RatingSummary;
  activeFilter: number | null;
  onFilterChange: (rating: number | null) => void;
}) {
  const { averageRating, totalReviews, distribution } = summary;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
      {/* Left: Average rating */}
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
        <p className="text-4xl font-black text-slate-900 sm:text-5xl">
          {averageRating > 0 ? averageRating.toFixed(1) : "—"}
        </p>
        <div className="mt-1.5">
          <StarDisplay rating={averageRating} size={18} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Based on {totalReviews} review{totalReviews !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Right: Distribution bars */}
      <div className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution?.[star] || 0;
          const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
          const isActive = activeFilter === star;

          return (
            <button
              key={star}
              onClick={() => onFilterChange(isActive ? null : star)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 transition ${
                isActive
                  ? "bg-brand-gold/10"
                  : "hover:bg-slate-50"
              }`}
            >
              <span className={`w-6 text-right text-xs font-bold ${isActive ? "text-brand-gold" : "text-slate-500"}`}>
                {star}
              </span>
              <Star size={12} className={`flex-shrink-0 ${isActive ? "fill-[#C8A84E] text-brand-gold" : "fill-slate-300 text-slate-300"}`} />
              <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className={`h-full rounded-full ${isActive ? "bg-brand-gold" : "bg-slate-300"}`}
                />
              </div>
              <span className={`w-8 text-right text-[11px] font-semibold ${isActive ? "text-brand-gold" : "text-slate-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Star({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
