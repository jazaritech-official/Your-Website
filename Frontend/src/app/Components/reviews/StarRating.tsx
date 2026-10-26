"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/* ============================================================
   STAR RATING — Interactive star selector + display
   
   Used in:
   - Review form (interactive)
   - Review cards (display only)
   - Product summary (display only)
   ============================================================ */

/** Display-only star rating */
export function StarDisplay({
  rating,
  size = 16,
  className = "",
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={
            s <= Math.round(rating)
              ? "fill-[#C8A84E] text-brand-gold"
              : s - 0.5 <= rating
                ? "fill-[#C8A84E]/50 text-brand-gold"
                : "text-slate-300"
          }
        />
      ))}
    </div>
  );
}

/** Interactive star rating for forms */
export function StarSelector({
  value,
  onChange,
  size = 28,
  className = "",
}: {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === value}
          aria-label={`${s} star${s > 1 ? "s" : ""}`}
          onClick={() => onChange(s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/60 rounded"
        >
          <Star
            size={size}
            className={`transition-colors duration-150 ${
              s <= (hover || value)
                ? "fill-[#C8A84E] text-brand-gold"
                : "text-slate-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
