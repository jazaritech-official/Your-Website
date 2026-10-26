"use client";
import { formatPKR } from "@/app/utils/format";

/* CartDrawer — quick-view cart side drawer (presentation layer only).
 *
 * Pure UI enhancement: reads the SAME cart data the /cart and /checkout pages
 * use (backend GET /cart for logged-in users, localStorage for guests) and
 * mutates it through the SAME shared `useCartActions` hook those pages use, so
 * optimistic update / stock check / rollback semantics are identical. No cart,
 * checkout or pricing business logic lives here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import axios from "axios";
import { closeCartDrawer } from "../Redux/Features/modalSlice";
import type { RootState, AppDispatch } from "../Redux/store";
import {
  baseUrl,
  getLocalCart,
  resolveItemPrice,
  hasVariantInventory,
} from "../utils/commonFunctions";
import { useCartActions } from "../utils/useCartActions";
import { resolveLineKey } from "../utils/cartIdentity";
import { Button, EmptyState } from "./ui";

interface DrawerItem {
  _id: string;
  /** Per-line address (product + variant + customization). */
  lineKey: string;
  name: string;
  price: number;
  quantity: number;
  images?: Array<{ url: string }>;
  stock?: number;
  selectedColor?: string;
  selectedSize?: string;
  /** Variant-aware pricing/stock — required so the drawer can resolve the
      SAME effective unit price the /cart page and checkout resolve. Products
      on size-wise pricing intentionally store a flat `price` of 0 and keep
      their real prices in `variantPricing`, so reading `price` alone showed
      "Rs 0". */
  variantPricing?: Record<string, number>;
  variantStock?: Record<string, number>;
  customizationAnswers?: Array<{ label: string; value: string }>;
}

/** Match the /cart page's backend normalization (product-embedded cart docs). */
const normalizeItem = (item: any): DrawerItem | null => {
  const product = item?.product || item || {};
  const id =
    product._id || item?._id || item?.id || item?.productId || "";
  if (!id) return null;
  const selectedColor =
    item?.selectedColor ?? product.selectedColor ?? item?.color ?? "";
  const selectedSize =
    item?.selectedSize ?? product.selectedSize ?? item?.size ?? "";
  const customizationAnswers = item?.customizationAnswers ?? [];
  return {
    _id: id,
    lineKey: resolveLineKey(item?.cartItemKey, {
      productId: id,
      selectedColor,
      selectedSize,
      customizationAnswers,
    }),
    name: product.name ?? item?.name ?? "Unknown Product",
    price: product.price ?? item?.price ?? 0,
    quantity: item?.quantity ?? 1,
    images: product.images ?? item?.images ?? [],
    stock: product.stock ?? item?.stock ?? 0,
    selectedColor,
    selectedSize,
    variantPricing: product.variantPricing ?? item?.variantPricing ?? {},
    variantStock: product.variantStock ?? item?.variantStock ?? {},
    customizationAnswers,
  };
};

const normalizeLocalItem = (item: any): DrawerItem | null => {
  if (!item?._id) return null;
  const selectedColor = item.selectedColor ?? item.color ?? "";
  const selectedSize = item.selectedSize ?? item.size ?? "";
  const customizationAnswers = item.customizationAnswers ?? [];
  return {
    _id: item._id,
    lineKey: resolveLineKey(null, {
      productId: item._id,
      selectedColor,
      selectedSize,
      customizationAnswers,
    }),
    name: item.name ?? "Unknown Product",
    price: item.price ?? 0,
    quantity: item.quantity ?? 1,
    images: Array.isArray(item.images) ? item.images : [],
    stock: item.stock ?? 0,
    selectedColor,
    selectedSize,
    variantPricing: item.variantPricing ?? item.product?.variantPricing ?? {},
    variantStock: item.variantStock ?? item.product?.variantStock ?? {},
    customizationAnswers,
  };
};

export default function CartDrawer() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const pathname = usePathname();
  const open = useSelector((state: RootState) => state.modal.cartDrawerOpen);
  const auth = useSelector((state: RootState) => state.auth);

  const [items, setItems] = useState<DrawerItem[]>([]);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => dispatch(closeCartDrawer()), [dispatch]);

  // Close whenever the route changes (navigation is a full context switch).
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const load = useCallback(async () => {
    if (!auth.username) {
      const local = (getLocalCart() as any[]) || [];
      setItems(local.map(normalizeLocalItem).filter(Boolean) as DrawerItem[]);
      return;
    }
    try {
      const res = await axios.get(`${baseUrl}cart/`, {
        withCredentials: true,
      });
      const raw = res.data?.data ?? res.data;
      const list = Array.isArray(raw) ? raw : [];
      setItems(list.map(normalizeItem).filter(Boolean) as DrawerItem[]);
    } catch {
      // Silent — the /cart page surfaces real errors; the drawer stays usable.
      setItems([]);
    }
  }, [auth.username]);

  // Fresh data every time the drawer opens, plus live re-sync on cart events.
  useEffect(() => {
    if (open) {
      setLoading(true);
      load().finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const sync = () => load();
    window.addEventListener("cart-updated", sync);
    return () => window.removeEventListener("cart-updated", sync);
  }, [load]);

  const { removeItem } = useCartActions<DrawerItem>(
    items,
    setItems,
    !!auth.username,
    load,
    undefined,
  );

  // Same effective-price helper the /cart page and checkout use, so the
  // drawer can never disagree with the surfaces the customer buys from.
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + resolveItemPrice(item) * item.quantity, 0),
    [items],
  );
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  // Lock body scroll while the drawer is open (same pattern as other overlays).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes the dialog — keyboard parity with the backdrop click. The
  // drawer already declares role="dialog"/aria-modal, so it must be
  // dismissible from the keyboard.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const handleRemove = async (id: string) => {
    await removeItem(id);
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[130] bg-brand-navy/40"
            onClick={close}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.aside
            key="cart-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-[131] flex h-full w-full max-w-[400px] flex-col bg-surface shadow-sheet"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-brand-navy">
                <ShoppingBag size={16} className="text-brand-gold-hover" aria-hidden />
                Your Cart
                {itemCount > 0 && (
                  <span className="rounded-full bg-brand-gold/12 px-2 py-0.5 text-[10px] font-bold text-brand-gold-hover">
                    {itemCount}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close cart"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-navy"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                /* Skeleton rows mirror the real row box, so the drawer no longer
                   flashes a lone spinner and then reflows. */
                <ul className="space-y-3" aria-hidden>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
                    >
                      <div className="h-14 w-14 flex-shrink-0 animate-pulse rounded-card bg-surface-muted" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-muted" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-muted" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-muted" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : items.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    compact
                    className="w-full"
                    icon={<ShoppingBag size={24} />}
                    title="Your cart is empty"
                    description="Add something you love and it will appear here."
                    action={
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => go("/productsPage")}
                      >
                        Start Shopping
                      </Button>
                    }
                  />
                </div>
              ) : (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {items.map((item) => {
                      const img =
                        item.images?.[0]?.url ?? "/carousel/Clothes.jpg";
                      return (
                        <motion.li
                          key={item.lineKey}
                          layout
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                          transition={{ layout: { duration: 0.3, ease: "easeOut" } }}
                          className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
                        >
                          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-card bg-surface-muted ring-1 ring-line">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img}
                              alt={item.name}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-brand-navy">
                              {item.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-muted">
                              {item.selectedColor && item.selectedColor}
                              {item.selectedColor && item.selectedSize && " · "}
                              {item.selectedSize && item.selectedSize}
                              {" · "}
                              Qty {item.quantity}
                            </p>
                            <p className="mt-0.5 text-xs font-black text-brand-navy">
                              {(() => {
                                const resolvedPrice = resolveItemPrice(item);
                                // Same honest state the /cart page shows for a
                                // variant-managed line with no size chosen yet.
                                if (
                                  hasVariantInventory(item) &&
                                  !item.selectedSize &&
                                  resolvedPrice === 0
                                ) {
                                  return (
                                    <span className="text-[11px] font-semibold text-ink-subtle">
                                      Select a size to see price
                                    </span>
                                  );
                                }
                                return `${formatPKR(resolvedPrice)}`;
                              })()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemove(item.lineKey)}
                            aria-label={`Remove ${item.name} from cart`}
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-[#C14444]/10 hover:text-[#C14444]"
                          >
                            <Trash2 size={15} />
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Subtotal
                  </span>
                  <span className="text-lg font-black tracking-tight text-brand-navy">
                    {formatPKR(subtotal)}
                  </span>
                </div>
                <Button
                  variant="gold"
                  size="md"
                  fullWidth
                  className="mb-2"
                  onClick={() => go("/checkout")}
                >
                  Checkout
                  <ArrowRight size={15} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => go("/cart")}
                >
                  View Full Cart
                </Button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
