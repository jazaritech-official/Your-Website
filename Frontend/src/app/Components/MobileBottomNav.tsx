"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Home,
  Grid3X3,
  ShoppingCart,
  Package,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Explore", href: "/productsPage", icon: Grid3X3 },
  { label: "Cart", href: "/cart", icon: ShoppingCart },
  { label: "Orders", href: "/profile/orders", icon: Package },
  { label: "Me", href: "/profile", icon: User },
] as const;

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  const [cartCount, setCartCount] = useState(0);

  // Reuse the SAME cart-count logic as the Navbar (event-driven, no polling).
  // Logged-in users are also covered authoritatively by the "cart-count-updated"
  // event the Navbar dispatches after its own fetch, so this stays a single
  // optimistic read with no extra API call.
  useEffect(() => {
    const updateCartCount = () => {
      try {
        const cart = JSON.parse(localStorage.getItem("irhasinn_cart") ?? "[]");
        setCartCount(
          cart.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
        );
      } catch {
        setCartCount(0);
      }
    };

    updateCartCount();
    window.addEventListener("storage", updateCartCount);
    window.addEventListener("cart-updated", updateCartCount);
    return () => {
      window.removeEventListener("storage", updateCartCount);
      window.removeEventListener("cart-updated", updateCartCount);
    };
  }, [auth.username]);

  // Also listen for cart-count-updated events carrying the exact count from Navbar.
  useEffect(() => {
    const handleCartCount = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.count === "number") {
        setCartCount(detail.count);
      }
    };
    window.addEventListener("cart-count-updated", handleCartCount);
    return () => window.removeEventListener("cart-count-updated", handleCartCount);
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[50] md:hidden border-t border-line bg-surface/95 backdrop-blur-xl"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              className="relative flex flex-col items-center justify-center gap-0.5 w-14 h-14 outline-none"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              {/* Active indicator dot */}
              {active && (
                <motion.span
                  layoutId="mobile-nav-indicator"
                  className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-brand-gold"
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}

              <motion.div
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="relative bottom-nav-icon"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.3 : 1.8}
                  className={
                    active
                      ? "text-brand-gold"
                      : "text-brand-navy/50"
                  }
                />

                {/* Cart badge */}
                {item.href === "/cart" && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-gold px-1 text-[8px] font-bold text-white leading-none shadow-sm">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </motion.div>

              <span
                className={`text-[10px] font-semibold leading-none transition-colors duration-200 ${
                  active ? "text-brand-gold" : "text-brand-navy/45"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
