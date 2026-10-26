"use client";
import { formatPKR } from "@/app/utils/format";

import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingCart, Heart, Loader2 } from "lucide-react";
import { buttonHover, buttonTap, popOnce, heartPop } from "../../utils/motion";
import type { ProductCardProps } from "./types";

/* ============================================================
   Variant B — "Gallery"
   ------------------------------------------------------------
   Taller 4:5 image, single-line inline price, and a quick-action
   bar that stays hidden on pointer devices until the card is
   hovered or keyboard-focused (always visible on touch, where
   hover does not exist). Stock is surfaced as a corner badge
   rather than a full-bleed overlay.

   Same props, same handlers, same numbers as Variant A.
   ============================================================ */

export default function ProductCardVariantB({
  product,
  interaction,
  isHovered,
  isWishlisted,
  wishlistLoading,
  isAddingToCart,
  inStock,
  hasRange,
  minSizePrice,
  maxSizePrice,
  displayPrice,
  primaryImageUrl,
  secondaryImageUrl,
  cartIconControls,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
}: ProductCardProps) {
  return (
    <motion.div
      {...interaction}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      {/* Portrait Image Box */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-card bg-surface-muted">
        <motion.div
          animate={{ scale: isHovered ? 1.05 : 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative h-full w-full"
        >
          <Image
            src={primaryImageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            loading="lazy"
            decoding="async"
            className={`object-cover transition-opacity duration-200 ${inStock ? "" : "opacity-60"}`}
          />

          {/* Secondary image cross-fades in on hover (no slide here). */}
          {isHovered && secondaryImageUrl !== primaryImageUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute inset-0 h-full w-full"
            >
              <Image
                src={secondaryImageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
              />
            </motion.div>
          )}
        </motion.div>

        {/* Stock badge sits on the image, worst case is not hidden behind it. */}
        {!inStock && (
          <span className="absolute left-2 top-2 z-10 rounded-field bg-white px-2 py-1 text-[10px] font-bold text-brand-navy shadow-md">
            Out of Stock
          </span>
        )}

        {/* Quick actions — hover/focus reveal on pointer devices, always on touch. */}
        <div className="absolute right-2 top-2 z-10 flex gap-1.5 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onToggleWishlist}
            disabled={wishlistLoading}
            aria-pressed={isWishlisted}
            aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-transform duration-200 hover:scale-110 active:scale-95 disabled:opacity-50"
          >
            <motion.span
              variants={heartPop}
              initial="off"
              animate={isWishlisted ? "on" : "off"}
              className="flex items-center justify-center"
            >
              <Heart
                size={16}
                className={`transition-colors duration-200 ${isWishlisted
                    ? "fill-[#C14444] text-[#C14444]"
                    : "text-[#222831]/60"
                  }`}
              />
            </motion.span>
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
        <div>
          <h3 className="line-clamp-1 text-[14px] font-extrabold leading-snug tracking-tight text-brand-navy transition-colors duration-200 group-hover:text-brand-gold-hover">
            {product.name}
          </h3>

          {/* Price inline instead of stacked: headline + optional range tail. */}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <p className="text-[16px] font-black leading-none text-brand-navy">
              {hasRange
                ? `From ${formatPKR(minSizePrice)}`
                : `${formatPKR(displayPrice)}`}
            </p>
            {hasRange && (
              <span className="text-[10px] font-semibold text-ink-subtle">
                up to {formatPKR(maxSizePrice)}
              </span>
            )}
          </div>
        </div>

        {/* Action Row — every handler stays reachable in this layout too. */}
        <div className="mt-1 flex items-stretch gap-1.5 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <motion.button
            type="button"
            onClick={onAddToCart}
            disabled={!inStock || isAddingToCart}
            whileHover={{ ...buttonHover }}
            whileTap={{ ...buttonTap }}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-field bg-brand-navy py-2 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-brand-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isAddingToCart ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <motion.span
                  variants={popOnce}
                  initial="rest"
                  animate={cartIconControls}
                  className="flex items-center justify-center"
                >
                  <ShoppingCart size={13} />
                </motion.span>
                Add to Cart
              </>
            )}
          </motion.button>

          <motion.button
            type="button"
            onClick={onBuyNow}
            disabled={!inStock || isAddingToCart}
            whileHover={{ ...buttonHover }}
            whileTap={{ ...buttonTap }}
            className="flex min-h-10 items-center justify-center gap-1 rounded-field border border-brand-gold/60 bg-brand-gold/10 px-2.5 py-2 text-[11px] font-bold text-brand-gold-hover transition-colors duration-200 hover:bg-brand-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Buy Now
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
