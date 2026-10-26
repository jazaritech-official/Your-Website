"use client";
import { formatPKR } from "@/app/utils/format";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Heart, Loader2 } from "lucide-react";
import { buttonHover, buttonTap, popOnce, heartPop } from "../../utils/motion";
import type { ProductCardProps } from "./types";

/* ============================================================
   Variant A — "Classic" (the storefront's original Product Card)
   ------------------------------------------------------------
   Square image on top, stacked name + price, always-visible
   Add to Cart / Buy Now row, wishlist pill top-right and a
   full-bleed out-of-stock overlay. This markup is the design
   that shipped before the variant switcher existed, so it is the
   default. Do not "tidy" this file — any visual change here is a
   change to the live storefront.
   ============================================================ */

export default function ProductCardVariantA({
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
      {/* Square Image Box with Fast Clip/Reveal Transition */}
      <div className="relative aspect-square w-full overflow-hidden rounded-t-card bg-surface-muted">
        <motion.div
          animate={{ scale: isHovered ? 1.05 : 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative h-full w-full"
        >
          {/* Base Primary Image */}
          <Image
            src={primaryImageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            loading="lazy"
            decoding="async"
            className="object-cover"
          />

          {/* Fast Slide/Wipe Reveal Secondary Image */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ x: "100%", opacity: 0.8 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0.8 }}
                transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                className="absolute inset-0 z-0 h-full w-full"
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
          </AnimatePresence>
        </motion.div>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={onToggleWishlist}
          disabled={wishlistLoading}
          aria-pressed={isWishlisted}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-transform duration-200 hover:scale-110 active:scale-95 disabled:opacity-50"
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          {/* Elastic pop on toggle — plays only when `isWishlisted` actually
              changes (real state), never on a timer. */}
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

        {/* Out of Stock Overlay */}
        {!inStock && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45">
            <span className="rounded-field bg-white px-3 py-1.5 text-[11px] font-bold text-brand-navy shadow-md">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Info Section - Highlighting Name and Price */}
      <div className="p-3 flex flex-col justify-between flex-1 gap-2">
        <div>
          {/* Prominent Product Name */}
          <h3 className="line-clamp-1 text-[14px] font-extrabold leading-snug tracking-tight text-brand-navy transition-colors duration-200 group-hover:text-brand-gold-hover">
            {product.name}
          </h3>

          {/* Prominent Price Display.
              Size-wise products render as "From Rs X" + a small "up to Rs Y"
              line. The previous single-line "Rs X - Rs Y" string overflowed the
              card on 2-column mobile grids once the numbers reached 4 digits. */}
          <div className="mt-1">
            <p className="text-[16px] font-black leading-none text-brand-navy">
              {hasRange
                ? `From ${formatPKR(minSizePrice)}`
                : `${formatPKR(displayPrice)}`}
            </p>
            {hasRange && (
              <p className="mt-0.5 text-[10px] font-semibold text-ink-subtle">
                up to {formatPKR(maxSizePrice)}
              </p>
            )}
          </div>
        </div>

        {/* Cart Action Buttons */}
        <div className="mt-1 flex items-stretch gap-1.5">
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
