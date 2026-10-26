"use client";

import Link from "next/link";
import { Phone, User, ShoppingCart } from "lucide-react";
import type { NavbarProps } from "./types";

/* Top contact strip — always identical across designs. Moved verbatim. */
export default function TopStrip({
  cartCount,
  onOpenCartDrawer,
}: Pick<NavbarProps, "cartCount" | "onOpenCartDrawer">) {
  return (
    <div className="bg-brand-navy-deep text-white/90 text-[11px] border-b border-white/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between h-8 sm:h-9">
        <div className="flex items-center gap-2">
          <Phone size={11} className="text-brand-gold" />
          <a href="https://wa.me/923323238544" target="_blank" rel="noopener noreferrer" className="font-medium text-[11px] tracking-wide hover:text-white transition-colors">0332-3238544</a>
          <span className="text-white/25 mx-2 hidden sm:inline">|</span>
          <span className="text-white/40 text-[10px] hidden sm:inline">24/7 Customer Support</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/profile"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <User size={11} />
            <span className="hidden sm:inline text-[10px] font-medium">My Account</span>
          </Link>
          <span className="text-white/15">|</span>
          <button
            type="button"
            onClick={onOpenCartDrawer}
            className="relative flex cursor-pointer items-center gap-1.5 bg-transparent hover:text-white transition-colors"
          >
            <ShoppingCart size={11} />
            <span className="hidden sm:inline text-[10px] font-medium">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-gold px-0.5 text-[9px] font-bold leading-none text-white shadow-sm sm:-right-2.5 sm:-top-2">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
