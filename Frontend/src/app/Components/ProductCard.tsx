"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  baseUrl,
  getLocalCart,
  setLocalCart,
  showToast,
  fetchWishlistIds,
  refetchWishlistIds,
  cloudinaryUrl,
  getSizePriceRange,
  getEffectiveStock,
} from "../utils/commonFunctions";
import { RootState, AppDispatch } from "../Redux/store";
import { openLogin } from "../Redux/Features/modalSlice";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAnimation } from "framer-motion";
import dynamic from "next/dynamic";
import ProductCardVariantA from "./product-card/VariantA";
import type {
  ProductCardInteraction,
  ProductCardProps,
  ProductCardProduct,
  ProductCardVariant,
} from "./product-card/types";

// B and C are DORMANT: no call site passes `variant`, so Variant A is always
// rendered. They are code-split so their markup never ships in the initial
// bundle; if a future selector requests B/C they load on demand. The default
// (Variant A) path is completely unchanged.
const ProductCardVariantB = dynamic(() => import("./product-card/VariantB"));
const ProductCardVariantC = dynamic(() => import("./product-card/VariantC"));

/* ============================================================
   Product Card — CONTAINER
   ------------------------------------------------------------
   This file is the ONLY place that owns product-card behaviour:
   wishlist syncing, add-to-cart / buy-now API calls (and the
   guest localStorage fallback), size-wise pricing, effective
   stock and click-through to the product page.

   Everything below the `Variant` line is purely presentational and
   lives in ./product-card/Variant*.tsx, fed by the shared
   `ProductCardProps` contract. Swapping the variant changes the
   look only — the data source, handlers and derived numbers are
   the same values, so a design change cannot change behaviour.

   The default export, its path and its `{ product }` prop are
   unchanged, so all four existing call sites keep working as-is.
   ============================================================ */

export type { ProductCardProduct, ProductCardVariant } from "./product-card/types";

/**
 * The layout rendered when nothing (or an unknown value) is selected.
 * Phase B3 will feed the admin's saved choice in here; until then every
 * call site renders Variant A, i.e. exactly what shipped before.
 */
export const DEFAULT_PRODUCT_CARD_VARIANT: ProductCardVariant = "A";

const VARIANTS: Record<ProductCardVariant, React.ComponentType<ProductCardProps>> = {
  A: ProductCardVariantA,
  B: ProductCardVariantB,
  C: ProductCardVariantC,
};

export default function ProductCard({
  product,
  variant = DEFAULT_PRODUCT_CARD_VARIANT,
}: {
  product: ProductCardProduct;
  /** Optional design selection. Omitted by every current call site → Variant A. */
  variant?: ProductCardVariant;
}) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cartIconControls = useAnimation();

  // Subtle "added" pop on the cart icon
  const wasAddingRef = useRef(false);
  useEffect(() => {
    if (wasAddingRef.current && !isAddingToCart) {
      cartIconControls.start("pop");
    }
    wasAddingRef.current = isAddingToCart;
  }, [isAddingToCart, cartIconControls]);

  // Wishlist Syncing
  useEffect(() => {
    if (!auth.username) return;
    try {
      const stored = localStorage.getItem("irhasinn_wishlist_ids");
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          setIsWishlisted(ids.includes(product._id));
        }
      }
    } catch (err) {
      // Previously silent. Reading the local wishlist cache can fail on
      // corrupt/unavailable storage; log it so the failure is diagnosable
      // without changing the (already-safe) fallback behaviour.
      console.error("[ProductCard] wishlist cache read failed:", err);
    }
  }, [auth.username, product._id]);

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    fetchWishlistIds().then((ids) => {
      if (!cancelled) setIsWishlisted(ids.includes(product._id));
    });
    return () => { cancelled = true; };
  }, [auth.username, product._id]);

  const toggleWishlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.username) {
      dispatch(openLogin());
      return;
    }
    setWishlistLoading(true);
    try {
      if (isWishlisted) {
        await axios.delete(`${baseUrl}auth/wishlist/${product._id}`, { withCredentials: true });
        setIsWishlisted(false);
        showToast("Removed from wishlist", "info");
      } else {
        await axios.post(`${baseUrl}auth/wishlist/${product._id}`, {}, { withCredentials: true });
        setIsWishlisted(true);
        showToast("Added to wishlist!", "success");
      }
      refetchWishlistIds();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to update wishlist", "error");
    } finally {
      setWishlistLoading(false);
    }
  };

  // Image parsing logic
  const primaryImageUrl =
    cloudinaryUrl(product.images?.[0]?.url, 600) || "/carousel/Clothes.jpg";
  const secondaryImageUrl =
    product.images?.[1]?.url
      ? cloudinaryUrl(product.images[1].url, 600)
      : primaryImageUrl;

  // Pricing calculations
  const { minPrice: minSizePrice, maxPrice: maxSizePrice, hasRange } = useMemo(
    () => getSizePriceRange(product.variantPricing),
    [product.variantPricing],
  );
  const displayPrice = hasRange ? minSizePrice : product.price;

  const inStock = useMemo(() => getEffectiveStock(product) > 0, [product]);

  /**
   * Add ONE unit of this product to the cart — server cart when signed in,
   * localStorage otherwise. This is the single implementation both handlers
   * below share; it deliberately does NOT toast or navigate, so each caller
   * keeps its exact previous success/redirect behaviour and ordering
   * (mutate → optional toast → dispatch → optional navigate).
   */
  const addProductToCart = async () => {
    if (auth.username) {
      await axios.post(
        `${baseUrl}cart`,
        { productId: product._id, quantity: 1 },
        { withCredentials: true },
      );
      return;
    }
    const currentCart = getLocalCart() as Array<ProductCardProduct & { quantity: number }>;
    const existing = currentCart.find((item) => item._id === product._id);
    if (existing) existing.quantity += 1;
    else currentCart.push({ ...product, quantity: 1 } as ProductCardProduct & { quantity: number });
    setLocalCart(currentCart);
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    try {
      await addProductToCart();
      showToast(`${product.name} added to cart`, "success");
      window.dispatchEvent(new Event("cart-updated"));
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to add to cart", "error");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    try {
      await addProductToCart();
      window.dispatchEvent(new Event("cart-updated"));
      router.push("/checkout");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to add to cart", "error");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleCardClick = useCallback(
    () => router.push(`/product/${product._id}`),
    [router, product._id],
  );

  /**
   * Single source of truth for how the card root behaves. Every variant
   * spreads this object onto its own root element, so keyboard support,
   * aria labelling and click-through cannot drift between designs.
   */
  const interaction = useMemo<ProductCardInteraction>(
    () => ({
      role: "button",
      tabIndex: 0,
      "aria-label": `View ${product.name}`,
      onClick: handleCardClick,
      onKeyDown: (event) => {
        /* role="button" must respond to BOTH Enter and Space. */
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCardClick();
        }
      },
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    }),
    [product.name, handleCardClick],
  );

  const Variant = VARIANTS[variant] ?? ProductCardVariantA;

  return (
    <Variant
      product={product}
      interaction={interaction}
      isHovered={isHovered}
      isWishlisted={isWishlisted}
      wishlistLoading={wishlistLoading}
      isAddingToCart={isAddingToCart}
      inStock={inStock}
      hasRange={hasRange}
      minSizePrice={minSizePrice}
      maxSizePrice={maxSizePrice}
      displayPrice={displayPrice}
      primaryImageUrl={primaryImageUrl}
      secondaryImageUrl={secondaryImageUrl}
      cartIconControls={cartIconControls}
      onAddToCart={handleAddToCart}
      onBuyNow={handleBuyNow}
      onToggleWishlist={toggleWishlist}
    />
  );
}
