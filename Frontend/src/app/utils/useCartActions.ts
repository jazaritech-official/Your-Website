import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import axios from "axios";
import { baseUrl, setLocalCart, showToast } from "./commonFunctions";

interface CartItemLike {
  /** Product id — still the identity used for order creation. */
  _id: string;
  /**
   * Stable per-LINE address: product + variant + customization. Once the same
   * product can be customized differently twice, two lines share a product id,
   * so quantity/remove must address `lineKey` and never `_id`.
   */
  lineKey: string;
  quantity: number;
  stock?: number;
}

/**
 * Shared optimistic cart mutations — the single source of truth used by BOTH
 * the Cart page and the Checkout page.
 *
 * Extracted verbatim from the Cart page so the exact same stock check,
 * optimistic update, backend reconciliation and failure rollback behaviour is
 * reused everywhere. Never fork this — a second copy is how the "laggy
 * quantity" bug comes back.
 *
 * @param cartItems      Current items (page-local state).
 * @param setCartItems   State setter for the items.
 * @param isLoggedIn     When true mutations hit the backend cart API; when
 *                       false they write straight to localStorage.
 * @param reload         Optional — called after a successful logged-in removal
 *                       so the caller can re-sync from the backend (the Cart
 *                       page passes its `reFetch`).
 * @param onItemsChanged Optional — fired with the new items array after every
 *                       local mutation (the Cart page uses it to keep its
 *                       "empty cart" screen in sync).
 */
/** Pull the backend's message out of an unknown error, falling back cleanly. */
const getErrorMessage = (err: unknown, fallback: string) =>
  axios.isAxiosError(err)
    ? (err.response?.data as { message?: string } | undefined)?.message || fallback
    : err instanceof Error
      ? err.message
      : fallback;

export const useCartActions = <T extends CartItemLike>(
  cartItems: T[],
  setCartItems: Dispatch<SetStateAction<T[]>>,
  isLoggedIn: boolean,
  reload?: () => Promise<void>,
  onItemsChanged?: (items: T[]) => void,
) => {
  // Update quantity — OPTIMISTIC: update the UI immediately, reconcile with
  // the backend, roll back on failure.
  const updateCart = useCallback(
    async (lineKey: string, quantity: number) => {
      const existing = cartItems.find((c) => c.lineKey === lineKey);
      const available = existing?.stock ?? null;
      if (available !== null && quantity > available) {
        return showToast(`Only ${available} items available`, "error");
      }

      // OPTIMISTIC UPDATE: Update UI immediately for instant feedback
      const previousCartItems = cartItems;
      const optimisticItems = cartItems.map((item) =>
        item.lineKey === lineKey ? { ...item, quantity } : item,
      );
      setCartItems(optimisticItems);
      if (!isLoggedIn) {
        setLocalCart(optimisticItems);
      }
      if (onItemsChanged) onItemsChanged(optimisticItems);
      window.dispatchEvent(new Event("cart-updated"));

      if (isLoggedIn) {
        try {
          const res = await axios.put(
            `${baseUrl}cart/${encodeURIComponent(lineKey)}`,
            { quantity },
            { withCredentials: true },
          );
          // Optionally reconcile if backend returns a different quantity
          // (e.g. stock limit enforcement).
          const backendQuantity = res.data?.data?.quantity ?? res.data?.quantity;
          if (backendQuantity !== undefined && backendQuantity !== quantity) {
            const reconciled = optimisticItems.map((item) =>
              item.lineKey === lineKey
                ? { ...item, quantity: backendQuantity }
                : item,
            );
            setCartItems(reconciled);
            setLocalCart(reconciled);
            if (onItemsChanged) onItemsChanged(reconciled);
            window.dispatchEvent(new Event("cart-updated"));
          }
        } catch (err) {
          console.error("[Cart Update Error]:", err);
          // ROLLBACK: Revert to previous state on failure
          setCartItems(previousCartItems);
          if (!isLoggedIn) {
            setLocalCart(previousCartItems);
          }
          if (onItemsChanged) onItemsChanged(previousCartItems);
          window.dispatchEvent(new Event("cart-updated"));
          showToast(getErrorMessage(err, "Unable to update cart item"), "error");
        }
      }
    },
    [cartItems, isLoggedIn, onItemsChanged, setCartItems],
  );

  // Remove a single item.
  const removeItem = useCallback(
    async (lineKey: string) => {
      if (isLoggedIn) {
        try {
          await axios.delete(`${baseUrl}cart/${encodeURIComponent(lineKey)}`, {
            withCredentials: true,
          });
          const updated = cartItems.filter((item) => item.lineKey !== lineKey);
          setCartItems(updated);
          if (reload) await reload();
          if (onItemsChanged) onItemsChanged(updated);
          window.dispatchEvent(new Event("cart-updated"));
        } catch (err) {
          console.error("[Cart Delete Error]:", err);
          showToast(getErrorMessage(err, "Unable to remove cart item"), "error");
        }
      } else {
        const updated = cartItems.filter((item) => item.lineKey !== lineKey);
        setCartItems(updated);
        setLocalCart(updated);
        if (onItemsChanged) onItemsChanged(updated);
        window.dispatchEvent(new Event("cart-updated"));
      }
    },
    [cartItems, isLoggedIn, onItemsChanged, reload, setCartItems],
  );

  return { updateCart, removeItem };
};
