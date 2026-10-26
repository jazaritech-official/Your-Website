import type { useAnimation } from "framer-motion";
import type { KeyboardEvent, MouseEvent } from "react";

/**
 * The controls object returned by framer-motion's `useAnimation()`.
 * Derived from the hook itself because framer-motion v12 no longer
 * re-exports the old `AnimationControls` name.
 */
type CartIconControls = ReturnType<typeof useAnimation>;

/* ============================================================
   Product Card — shared variant contract
   ------------------------------------------------------------
   DESIGN-VARIANT SWITCHER, PART B.

   Golden rule: switching a card's VISUAL design must never change
   what the card DOES. To make that structurally impossible, every
   variant is a purely presentational component that receives the
   exact same props through this one interface — the container
   (Components/ProductCard.tsx) is the only place that owns state,
   data derivation, API calls and business rules.

   Consequences for anyone adding a variant:
   - Never fetch, never read redux, never compute prices/stock.
   - Never omit a handler: add-to-cart, buy-now and wishlist must
     all remain reachable in every variant.
   - Price rendering must reproduce the container's `hasRange`
     contract exactly (flat vs size-wise "From Rs X" + "up to Rs Y").
   ============================================================ */

/**
 * The product shape the card can render. Kept structurally compatible
 * with the API payloads every call site already passes, so variants
 * never see a different object than the container does.
 */
export interface ProductCardProduct {
  _id: string;
  name: string;
  description?: string;
  price: number;
  brand?: string;
  stock?: number;
  category?: { name: string } | string;
  images?: Array<{ url: string }>;
  averageRating?: number;
  colors?: string[];
  sizes?: string[];
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
  addedBy?: string;
}

/** Identifiers for the selectable Product Card layouts. */
export type ProductCardVariant = "A" | "B" | "C";

/**
 * The card root's interaction contract. The container builds this
 * object once and every variant spreads it onto its own root element
 * (`{...interaction}`), so keyboard access, aria labelling, click-through
 * and hover tracking are guaranteed to be identical no matter the design.
 */
export interface ProductCardInteraction {
  role: "button";
  tabIndex: number;
  "aria-label": string;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * Everything a presentational variant is allowed to render from.
 * All values are already derived by the container.
 */
export interface ProductCardProps {
  product: ProductCardProduct;

  /** Root interaction contract — spread onto the variant's root element. */
  interaction: ProductCardInteraction;

  /* ── Live interaction state (owned by the container) ── */
  isHovered: boolean;
  isWishlisted: boolean;
  wishlistLoading: boolean;
  isAddingToCart: boolean;

  /* ── Derived display values ── */
  inStock: boolean;
  /** True when size-wise pricing differs across variants. */
  hasRange: boolean;
  minSizePrice: number;
  maxSizePrice: number;
  /** The number to show as the headline price (min size price, or base price). */
  displayPrice: number;

  /* ── Resolved image sources ── */
  primaryImageUrl: string;
  secondaryImageUrl: string;

  /* ── Motion controls driven by real state changes ── */
  cartIconControls: CartIconControls;

  /* ── Handlers (identical behaviour in every variant) ── */
  onAddToCart: (event: MouseEvent) => void;
  onBuyNow: (event: MouseEvent) => void;
  onToggleWishlist: (event: MouseEvent) => void;
}
