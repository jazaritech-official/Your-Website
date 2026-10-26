"use client";

import Link from "next/link";
import clsx from "clsx";
import { ShoppingCart, Menu } from "lucide-react";
import type { NavbarProps } from "./types";

/* ─── MOBILE: Cart + Hamburger ─── Identical in every design variant. */
export default function MobileActions({
  cartCount,
  tones,
  setMenuOpen,
  className,
}: Pick<NavbarProps, "cartCount" | "tones" | "setMenuOpen"> & { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-1 md:hidden", className)}>
      <Link
        href="/cart"
        aria-label="Cart"
        className={clsx(
          "relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-200",
          tones.iconTone,
        )}
      >
        <ShoppingCart size={18} />
        {cartCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-gold px-1 text-[9px] font-bold text-white shadow-sm">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </Link>
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open Menu"
        className={clsx(
          "flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-200",
          tones.iconTone,
        )}
      >
        <Menu size={20} />
      </button>
    </div>
  );
}
