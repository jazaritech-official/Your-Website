"use client";
import { formatPKR } from "@/app/utils/format";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { ShoppingCart, Trash2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { RootState, AppDispatch } from "../Redux/store";
import { startLoading, stopLoading } from "../Redux/Features/uiSlice";
import useFetch, {
  baseUrl,
  getLocalCart,
  setLocalCart,
  showToast,
  cloudinaryUrl,
  getEffectiveStock,
  getVariantStock,
  hasVariantInventory,
  getVariantOptions,
  resolveItemPrice,
  getSizePriceRange,
} from "../utils/commonFunctions";
import LiveCustomPreview from "../Components/LiveCustomPreview";
import FreeShippingProgressBar from "../Components/FreeShippingProgressBar";
import QuantityStepper from "../Components/QuantityStepper";
import { useCartActions } from "../utils/useCartActions";
import { resolveLineKey } from "../utils/cartIdentity";
import { Button, EmptyState, SectionLabel } from "../Components/ui";
import { isImageUrlValue } from "../utils/customizationPreview";
import {
  calculateShipping,
  getShippingSettings,
  type ShippingSettings,
} from "../utils/shipping";
import type { PrintLayout } from "../utils/printLayout";

interface CartItem {
  _id: string;
  /**
   * Per-LINE address (product + variant + customization). Two lines can share
   * a product id once the same product is customized differently, so quantity
   * and remove must address `lineKey` while `_id` stays the product id.
   */
  lineKey: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  images?: Array<{ url: string }>;
  stock?: number;
  category?: string | null;
  selectedColor?: string;
  selectedSize?: string;
  colors?: string[];
  sizes?: string[];
  addedBy?: string;
  freeShipping?: boolean;
  /** Per-product shipping fee (Rs) charged when the order isn't free-shipping. */
  shippingCharge?: number;
  customizationAnswers?: Array<{ label: string; value: string }>;
  /** Stored admin-detected print layout (local-cart items carry it at top level). */
  printLayout?: PrintLayout | null;
  /** Variant-wise stock: { "Color__Size": stock, "Size": stock } */
  variantStock?: Record<string, number>;
  /** Variant-wise pricing: { "Color__Size": price, "Size": price } */
  variantPricing?: Record<string, number>;
  product?: {
    images?: Array<{ url: string }>;
    freeShipping?: boolean;
    printLayout?: PrintLayout | null;
  } | null;
}

const normalizeCartItem = (item: any): CartItem => {
  const _id = item._id || item.id || item.productId || item.product?._id || "";
  const selectedColor = item.selectedColor || item.color || item.variant?.color;
  const selectedSize = item.selectedSize || item.size || item.variant?.size;
  return {
    ...item,
    _id,
    selectedColor,
    selectedSize,
    lineKey: resolveLineKey(item.cartItemKey, {
      productId: _id,
      selectedColor,
      selectedSize,
      customizationAnswers: item.customizationAnswers || [],
    }),
  };
};

const getCartItemProductId = (item: any) =>
  item._id || item.id || item.productId || item.product?._id || "";

const CartPage = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [isAddingSuggested, setIsAddingSuggested] = useState(false);
  const [isBuyingNowSuggested, setIsBuyingNowSuggested] = useState(false);
  const [shippingSettings, setShippingSettings] =
    useState<ShippingSettings | null>(null);

  // Fetch the shipping settings once (module-cached) so the displayed cost
  // matches exactly what the backend charges at order time.
  useEffect(() => {
    let cancelled = false;
    getShippingSettings().then((s) => {
      if (!cancelled) setShippingSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    data: cartResponse,
    error: fetchError,
    reFetch,
  } = useFetch<any>(auth.username ? `${baseUrl}cart/` : "");

  // 1. Sync Logic and Guest Cart Handling
  useEffect(() => {
    const localCart = getLocalCart() as CartItem[];

    if (auth.username) {
      const handleSyncCart = async () => {
        // Only show the global loading overlay when there is actual sync work
        // to perform (guest cart items to push to the server). When the local
        // cart is already empty the effect fires and returns immediately — the
        // old dispatch(startLoading) → dispatch(stopLoading) pair caused a
        // visible loading-flicker on every cart page mount for logged-in users.
        if (localCart.length === 0) {
          return;
        }
        dispatch(startLoading("ZF Loading Cart"));
        setLoading(true);
        try {
          const normalizedLocalCart = localCart
            .map(normalizeCartItem)
            .filter((item) => item._id);

          if (normalizedLocalCart.length > 0) {
            await axios.post(
              `${baseUrl}cart/sync`,
              {
                cartItems: normalizedLocalCart.map((item) => ({
                  productId: getCartItemProductId(item),
                  quantity: item.quantity,
                  selectedColor: item.selectedColor || "",
                  selectedSize: item.selectedSize || "",
                  customizationAnswers: item.customizationAnswers || [],
                })),
              },
              {
                withCredentials : true,
              }
            );
            setLocalCart([]);
          }
          await reFetch();
        } catch (err: any) {
          console.error("[Cart Frontend Error]: Sync failed", err);
          setSyncError(
            err?.response?.data?.message ||
              "Unable to sync cart with your account.",
          );
        } finally {
          setLoading(false);
          dispatch(stopLoading());
        }
      };
      handleSyncCart();
    } else {
      const normalizedCart = localCart
        .map(normalizeCartItem)
        .filter((item) => item._id);
      setCartItems(normalizedCart);
      setIsEmpty(normalizedCart.length === 0);
    }
  }, [auth.username]); // Removed reFetch from dependency to prevent possible trigger loops

  // 2a. Sync Backend State to Frontend State
  useEffect(() => {
    if (!auth.username || !cartResponse?.data) return;

    const backendItems = cartResponse.data
      .map((item: any) => {
        const product = item.product || {};
        const id = product._id || item._id || item.id || item.productId || "";
        const categoryId = product?.category?._id || product?.category || null;
        const selectedColor =
          item.selectedColor ?? product.selectedColor ?? item.color ?? item.variant?.color;
        const selectedSize =
          item.selectedSize ?? product.selectedSize ?? item.size ?? item.variant?.size;
        const customizationAnswers = item.customizationAnswers ?? [];

        return {
          _id: id,
          lineKey: resolveLineKey(item.cartItemKey, {
            productId: id,
            selectedColor,
            selectedSize,
            customizationAnswers,
          }),
          name: product.name ?? item.name ?? "Unknown Product",
          description: product.description ?? item.description ?? "",
          price: product.price ?? item.price ?? 0,
          quantity: item.quantity ?? 1,
          images: product.images ?? item.images ?? [],
          stock: product.stock ?? item.stock ?? 0,
          category: categoryId,
          colors: product.colors ?? item.colors ?? [],
          sizes: product.sizes ?? item.sizes ?? [],
          addedBy: product.addedBy ?? item.addedBy,
          freeShipping: product.freeShipping ?? item.freeShipping ?? false,
          shippingCharge: product.shippingCharge ?? item.shippingCharge ?? 0,
          selectedColor,
          selectedSize,
          customizationAnswers,
          customizable: product.customizable ?? item.customizable ?? false,
          customizationFields: product.customizationFields ?? item.customizationFields ?? [],
          variantPricing: product.variantPricing ?? item.variantPricing ?? {},
          variantStock: product.variantStock ?? item.variantStock ?? {},
        };
      })
      .filter((item: any) => item._id);

    setCartItems(backendItems);
    setIsEmpty(backendItems.length === 0);
  }, [cartResponse, auth.username]);

  // 2b. Related products — only refetch when the set of cart product IDs
  // or the primary category changes, NOT on every cartResponse object
  // recreation (which happens after every quantity +/-, item remove, etc.).
  // This is the key decoupling from F-011: previously a quantity bump
  // created a fresh cartResponse → triggered related-product fetch →
  // created unnecessary network traffic.
  const cartIdentityKey = cartItems.map((i) => i._id).sort().join(",");
  const cartCategoryKey = cartItems.find((p) => p.category)?.category ?? "";
  useEffect(() => {
    if (cartItems.length === 0) {
      setRelatedProducts([]);
      return;
    }

    const fetchRelated = async () => {
      const categoryId = cartCategoryKey || null;
      try {
        setLoadingRelated(true);
        let res;
        if (categoryId) {
          res = await axios.get(
            `${baseUrl}product/getAllProducts?category=${encodeURIComponent(
              categoryId,
            )}&limit=12`,
            { withCredentials: true },
          );
        } else {
          res = await axios.get(`${baseUrl}product/getAllProducts?limit=12`, { withCredentials: true });
        }
        let products = res?.data?.data?.products ?? [];

        // If category returned no products, fallback to general products
        if ((!products || products.length === 0) && categoryId) {
          const fallback = await axios.get(`${baseUrl}product/getAllProducts?limit=12`, { withCredentials: true });
          products = fallback?.data?.data?.products ?? [];
        }

        const filtered = (products ?? [])
          .filter((p: any) => !cartItems.find((c) => c._id === (p._id || p.id)))
          .slice(0, 6);
        setRelatedProducts(filtered);
      } catch (err) {
        console.error("Related products fetch error", err);
        setRelatedProducts([]);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartIdentityKey, cartCategoryKey]);

  // Add to cart from related products
  const addSuggestedToCart = async (product: any) => {
    if (isAddingSuggested) return;
    setIsAddingSuggested(true);
    try {
      const productId = product._id || product.id;
      if (!productId) return;

      const effectiveStock = getEffectiveStock(product);
      if (effectiveStock <= 0) {
        return showToast("Product is out of stock", "error");
      }

      if (auth.username) {
        try {
          const res = await axios.post(
            `${baseUrl}cart/`,
            { productId, quantity: 1 },
            { withCredentials: true },
          );
          if (res.data?.status === "success" || res.data?.success === true || res.data?.data) {
            await reFetch();
            showToast("Added to cart", "success");
            window.dispatchEvent(new Event("cart-updated"));
          } else {
            showToast(res.data?.message || "Failed to add to cart", "error");
          }
        } catch (err: any) {
          console.error("Add suggested to cart error", err);
          showToast(
            err?.response?.data?.message || "Failed to add to cart",
            "error",
          );
        }
      } else {
        const local = getLocalCart();
        const exists = local.find((i: any) => (i._id || i.id) === productId);
        if (exists) {
          const newQty = (exists.quantity || 1) + 1;
          if (effectiveStock > 0 && newQty > effectiveStock)
            return showToast(`Only ${effectiveStock} items available`, "error");
          exists.quantity = newQty;
        } else {
          if (effectiveStock > 0 && 1 > effectiveStock)
            return showToast(`Only ${effectiveStock} items available`, "error");
          local.push({ ...product, _id: productId, quantity: 1 });
          setCartItems((prev) => [
            ...prev,
            { ...product, _id: productId, quantity: 1 },
          ]);
        }
        setLocalCart(local);
        showToast("Added to cart", "success");
      }
    } finally {
      setIsAddingSuggested(false);
    }
  };

  const buyNowSuggested = async (product: any) => {
    if (isBuyingNowSuggested) return;
    setIsBuyingNowSuggested(true);
    try {
      await addSuggestedToCart(product);
      router.push("/checkout");
    } finally {
      setIsBuyingNowSuggested(false);
    }
  };

  // 3. Totals Calculation
  const totals = useMemo(() => {
    const itemsPrice = cartItems.reduce(
      (sum, item) => sum + resolveItemPrice(item) * item.quantity,
      0,
    );
    // Same rules as the backend (utils/shipping.ts): per-product flag or
    // threshold-reached → free; otherwise the configured base fee applies.
    const shippingPrice = calculateShipping(
      cartItems,
      itemsPrice,
      shippingSettings,
    );
    return {
      itemsPrice,
      shippingPrice,
      totalPrice: itemsPrice + shippingPrice,
    };
  }, [cartItems, shippingSettings]);

  // 4. Update / remove cart items — single shared implementation (optimistic
  //    update + stock check + rollback) reused verbatim by the Cart and
  //    Checkout pages, so quantity changes feel instant and stay in sync.
  const { updateCart, removeItem } = useCartActions(
    cartItems,
    setCartItems,
    !!auth.username,
    reFetch,
    (items) => setIsEmpty(items.length === 0),
  );

  // Variant change handler — updates selectedSize/selectedColor for a cart item.
  // For logged-in users, persists to backend via POST /cart (addOrUpdateCartItem).
  // For local cart users, saves to localStorage.
  const handleVariantChange = async (
    itemId: string,
    field: "selectedColor" | "selectedSize",
    value: string,
  ) => {
    // Optimistic update
    const previousItems = cartItems;
    const nextItems = cartItems.map((item) =>
      item.lineKey === itemId ? { ...item, [field]: value } : item,
    );
    setCartItems(nextItems);
    if (!auth.username) setLocalCart(nextItems);

    // Persist to backend for logged-in users. The line identity is the product
    // plus its customization, so the existing add-or-update resolves to the
    // SAME line and only its variant fields move. The line's own answers are
    // echoed back so a customized line is never re-keyed into a new one.
    if (auth.username) {
      try {
        const item = cartItems.find((i) => i.lineKey === itemId);
        if (!item) return;
        const payload: Record<string, unknown> = {
          productId: item._id,
          quantity: item.quantity,
          customizationAnswers: item.customizationAnswers || [],
        };
        if (field === "selectedSize") payload.selectedSize = value;
        if (field === "selectedColor") payload.selectedColor = value;
        await axios.post(`${baseUrl}cart/`, payload, {
          withCredentials: true,
        });
      } catch (err) {
        console.error("[Cart Variant Error]:", err);
        setCartItems(previousItems);
        showToast("Failed to update variant selection", "error");
      }
    }
  };

  // 6. Clear Entire Cart Operation
  const clearCart = async () => {
    console.log("[Cart Action]: Clearing all items");
    if (auth.username) {
      try {
        await axios.delete(`${baseUrl}cart/`, { withCredentials: true });
        await reFetch();
        window.dispatchEvent(new Event("cart-updated"));
      } catch (err: any) {
        console.error("[Cart Clear Error]:", err);
        showToast(
          err?.response?.data?.message || "Unable to clear cart",
          "error",
        );
      }
    } else {
      setCartItems([]);
      setLocalCart([]);
      setIsEmpty(true);
      window.dispatchEvent(new Event("cart-updated"));
    }
  };

  const proceedToCheckout = () => {
    if (cartItems.length === 0) {
      showToast("Add at least one item before checkout", "error");
      return;
    }
    // Block checkout if any variant-managed item has no size selected
    const missingSize = cartItems.find(
      (item) => getVariantOptions(item.sizes).length > 0 && !item.selectedSize,
    );
    if (missingSize) {
      showToast(`Please select a size for "${missingSize.name}" before checkout.`, "error");
      return;
    }
    router.push("/checkout");
  };

  if (loading) {
    /* Skeleton mirrors the real two-column layout so the page does not jump
       from a line of text into a full grid. */
    return (
      <main className="min-h-screen bg-surface-page px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 space-y-3">
            <div className="h-3 w-28 animate-pulse rounded bg-surface-muted" />
            <div className="h-9 w-64 animate-pulse rounded bg-surface-muted" />
          </div>
          <div className="grid gap-8 lg:grid-cols-[1.5fr_0.85fr]">
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
                >
                  <div className="h-16 w-16 flex-shrink-0 animate-pulse rounded-card bg-surface-muted sm:h-24 sm:w-24" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-surface-muted" />
                    <div className="h-9 w-40 animate-pulse rounded-field bg-surface-muted" />
                  </div>
                </div>
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-card border border-line bg-surface shadow-card" />
          </div>
        </div>
      </main>
    );
  }

  if (isEmpty) {
    return (
      <main className="min-h-screen bg-surface-page px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<ShoppingCart size={26} />}
            title="Your cart is empty"
            description="Add products from any product page and they will be saved here for you."
            action={
              <Button
                variant="gold"
                size="md"
                onClick={() => router.push("/productsPage")}
              >
                <ShoppingCart size={17} /> Shop now
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-page px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionLabel>Your Cart</SectionLabel>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
              Shopping Cart
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="md"
              icon={<Trash2 size={17} />}
              onClick={clearCart}
            >
              Clear Cart
            </Button>
            <Button variant="gold" size="md" onClick={proceedToCheckout}>
              Proceed to Checkout
            </Button>
          </div>
        </div>

        {/* A failed guest→account cart sync is a real failure, so it is shown
            with error semantics instead of the previous neutral white card. */}
        {syncError && (
          <div
            role="alert"
            className="mb-6 rounded-card border border-state-danger/25 bg-state-danger/[0.05] p-5 text-sm text-state-danger"
          >
            {syncError}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.5fr_0.85fr]">
          <div className="space-y-5">
            <AnimatePresence initial={false}>
            {cartItems.map((item) => {
              const hasCustomization =
                item.customizationAnswers &&
                item.customizationAnswers.length > 0;
              const imageSrc = item.images?.[0]?.url ?? "/carousel/Clothes.jpg";
              // Thumbnail display transform — the preview canvas below keeps
              // the full-res image (print-layout rendering quality).
              const imageSrcThumb = cloudinaryUrl(imageSrc, 300) || imageSrc;
              return (
                <motion.div
                  key={item.lineKey}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18, ease: "easeOut" } }}
                  transition={{ layout: { duration: 0.3, ease: "easeOut" } }}
                  className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
                >
                  <div className="flex items-start gap-4 sm:gap-5">
                    {/* Product thumbnail — SAME treatment for normal &
                        personalized items: fixed square, object-cover,
                        flex-shrink-0 so it never gets squeezed. */}
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-card ring-1 ring-line sm:h-24 sm:w-24">
                      {hasCustomization ? (
                        <LiveCustomPreview
                          productImage={imageSrc}
                          rawAnswers={item.customizationAnswers}
                          printLayout={
                            item.printLayout ?? item.product?.printLayout
                          }
                          showEmptyHint={false}
                          fit="cover"
                          className="h-full w-full"
                        />
                      ) : (
                        <img
                          src={imageSrcThumb}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    {/* Product details — min-w-0 so long names wrap instead
                        of pushing the row past the viewport */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-brand-navy sm:text-xl">
                            {item.name}
                          </h2>
                          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                            {item.description ?? "High quality product"}
                          </p>
                          {/* Variant selectors — matching checkout's pattern */}
                          {(Boolean(getVariantOptions(item.colors).length) || Boolean(getVariantOptions(item.sizes).length)) ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {Boolean(getVariantOptions(item.colors).length) && (
                                <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                                  Color
                                  <select
                                    value={item.selectedColor || ""}
                                    onChange={(e) => handleVariantChange(item.lineKey, "selectedColor", e.target.value)}
                                    className="min-h-10 rounded-field border border-line bg-surface px-3 text-xs font-semibold normal-case tracking-normal text-brand-navy outline-none transition focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/15"
                                  >
                                    <option value="" disabled>Select color</option>
                                    {getVariantOptions(item.colors).map((color) => <option key={color} value={color}>{color}</option>)}
                                  </select>
                                </label>
                              )}
                              {Boolean(getVariantOptions(item.sizes).length) && (
                                <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                                  Size
                                  <select
                                    value={item.selectedSize || ""}
                                    onChange={(e) => handleVariantChange(item.lineKey, "selectedSize", e.target.value)}
                                    className="min-h-10 rounded-field border border-line bg-surface px-3 text-xs font-semibold normal-case tracking-normal text-brand-navy outline-none transition focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/15"
                                  >
                                    <option value="" disabled>Select size</option>
                                    {getVariantOptions(item.sizes).map((size) => {
                                      const sizeStock = hasVariantInventory(item)
                                        ? getVariantStock(item, item.selectedColor, size)
                                        : (item.stock ?? 0);
                                      const inStock = sizeStock > 0;
                                      return (
                                        <option key={size} value={size} disabled={!inStock}>
                                          {size}{!inStock ? " (Out of stock)" : ` (${sizeStock} in stock)`}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </label>
                              )}
                            </div>
                          ) : (
                            (item.selectedColor || item.selectedSize) && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.selectedColor && (
                                  <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10px] font-semibold capitalize text-ink-muted">
                                    {item.selectedColor}
                                  </span>
                                )}
                                {item.selectedSize && (
                                  <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                                    {item.selectedSize}
                                  </span>
                                )}
                              </div>
                            )
                          )}
                          {/* Warning when variant-managed item has no size selected */}
                          {getVariantOptions(item.sizes).length > 0 && !item.selectedSize && (
                            <p className="mt-1.5 text-[11px] font-semibold text-state-warning">
                              Please select a size to continue.
                            </p>
                          )}
                          {hasCustomization && (
                            <div className="mt-3">
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold-hover">
                                AI Live Preview
                              </p>
                              {/* Text answers at a glance (the photo composite
                                  is shown in the thumbnail above) */}
                              {(item.customizationAnswers ?? []).some((ans) =>
                                !isImageUrlValue(ans.value),
                              ) && (
                                <div className="flex flex-wrap gap-2 text-sm">
                                  {(item.customizationAnswers ?? [])
                                    .filter((ans) => !isImageUrlValue(ans.value))
                                    .map((ans, idx) => (
                                      <span
                                        key={idx}
                                        className="rounded-full border border-line bg-surface-muted px-3 py-1 text-xs text-brand-navy"
                                      >
                                        {ans.label}: {ans.value}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 rounded-field bg-surface-muted px-4 py-3 text-sm font-semibold text-brand-navy">
                          {(() => {
                            const resolvedPrice = resolveItemPrice(item);
                            // For variant-managed products with no size selected,
                            // show honest messaging instead of "Rs 0"
                            if (hasVariantInventory(item) && !item.selectedSize && resolvedPrice === 0) {
                              return <span className="text-xs text-ink-subtle">Select a size to see price</span>;
                            }
                            return `${formatPKR(resolvedPrice)}`;
                          })()}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <QuantityStepper
                          quantity={item.quantity}
                          onDecrease={() => {
                            if (hasVariantInventory(item) && !item.selectedSize) return;
                            updateCart(item.lineKey, Math.max(1, item.quantity - 1));
                          }}
                          onIncrease={() => {
                            if (hasVariantInventory(item) && !item.selectedSize) return;
                            updateCart(item.lineKey, item.quantity + 1);
                          }}
                          max={(() => {
                            if (hasVariantInventory(item) && item.selectedSize) {
                              return getVariantStock(item, item.selectedColor, item.selectedSize) || undefined;
                            }
                            if (hasVariantInventory(item)) return undefined;
                            return item.stock ?? undefined;
                          })()}
                          onQuantityChange={(qty) => {
                            if (hasVariantInventory(item) && !item.selectedSize) return;
                            const effectiveMax = hasVariantInventory(item) && item.selectedSize
                              ? getVariantStock(item, item.selectedColor, item.selectedSize)
                              : (item.stock ?? 0);
                            if (effectiveMax > 0 && qty >= effectiveMax && item.quantity < effectiveMax) {
                              showToast(`Quantity adjusted to ${effectiveMax} — maximum available for this size.`, "info");
                            }
                            updateCart(item.lineKey, qty);
                          }}
                        />

                        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
                          <span>Stock: {(() => {
                            if (hasVariantInventory(item) && item.selectedSize) {
                              return getVariantStock(item, item.selectedColor, item.selectedSize);
                            }
                            if (hasVariantInventory(item) && !item.selectedSize) {
                              return <span className="text-state-warning">Select a size</span>;
                            }
                            return item.stock ?? 0;
                          })()}</span>
                          {/* Was `bg-[#FFFFFF]` on a white card — an invisible
                              button. Now a bordered control with a red-tinted
                              hover, matching the destructive semantics. */}
                          <button
                            onClick={() => removeItem(item.lineKey)}
                            className="inline-flex items-center gap-2 rounded-field border border-line px-4 py-2 font-semibold text-brand-navy transition-colors hover:border-[#C14444]/40 hover:bg-[#C14444]/[0.06] hover:text-[#C14444]"
                          >
                            <XCircle size={16} aria-hidden /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>

            {relatedProducts.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-4 text-lg font-bold tracking-tight text-brand-navy">
                  You may also like
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {relatedProducts.map((p) => (
                    <div
                      key={p._id}
                      className="flex flex-col items-start rounded-card border border-line bg-surface p-3"
                    >
                      <img
                        src={cloudinaryUrl(p.images?.[0]?.url, 600) ?? "/carousel/Clothes.jpg"}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="mb-3 h-28 w-full rounded-md object-cover"
                      />
                      <div className="w-full flex-1">
                        <h4 className="line-clamp-2 text-sm font-semibold text-brand-navy">
                          {p.name}
                        </h4>
                        <div className="mt-2 flex w-full items-center justify-between">
                          {/* Size-wise products keep their real prices in
                              variantPricing and store a flat price of 0, so
                              reading `p.price` rendered "Rs 0" here. */}
                          <span className="text-sm font-black text-brand-navy">
                            {(() => {
                              const { minPrice, hasRange } = getSizePriceRange(
                                p.variantPricing,
                              );
                              return hasRange
                                ? `From ${formatPKR(minPrice)}`
                                : `${formatPKR((p.price ?? 0))}`;
                            })()}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 w-full flex gap-2">
                        {/* The built-in `loading` prop replaces the hand-rolled
                            spinner markup and keeps the button's width stable. */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          loading={isAddingSuggested}
                          onClick={() => addSuggestedToCart(p)}
                        >
                          {isAddingSuggested ? "Adding..." : "Add"}
                        </Button>
                        <Button
                          variant="gold"
                          size="sm"
                          className="flex-1"
                          loading={isBuyingNowSuggested}
                          onClick={() => buyNowSuggested(p)}
                        >
                          {isBuyingNowSuggested ? "Processing..." : "Buy Now"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="h-fit rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
            <div className="space-y-5">
              <div>
                <SectionLabel>Order summary</SectionLabel>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-navy sm:text-3xl">
                  Payment details
                </h2>
              </div>

              {/* Free shipping progress bar — shared component (admin toggle +
                  threshold aware, hidden when already free via a per-product
                  free-shipping flag) */}
              <FreeShippingProgressBar
                items={cartItems}
                subtotal={totals.itemsPrice}
              />

              {/* These rows were `bg-[#FFFFFF]` inside an already-white aside,
                  so they had no surface at all. */}
              <div className="space-y-4 rounded-field bg-surface-muted p-5">
                <div className="flex justify-between text-sm text-ink-muted">
                  <span>Items</span>
                  <span className="font-semibold text-brand-navy">
                    {formatPKR(totals.itemsPrice)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-ink-muted">
                  <span>Shipping</span>
                  <span className="font-semibold text-brand-navy">
                    {totals.shippingPrice > 0
                      ? `${formatPKR(totals.shippingPrice)}`
                      : "Free Shipping"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-4">
                  <span className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                    Total
                  </span>
                  <span className="text-2xl font-black tracking-tight text-brand-navy">
                    {formatPKR(totals.totalPrice)}
                  </span>
                </div>
              </div>

              <div className="rounded-field border border-line p-5 text-sm">
                <p className="font-semibold text-brand-navy">Cash on Delivery</p>
                <p className="mt-2 text-ink-muted">
                  Your items will be reserved now. Pay only when the delivery
                  arrives.
                </p>
              </div>

              <Button variant="gold" size="lg" fullWidth onClick={proceedToCheckout}>
                Checkout now
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default CartPage;
