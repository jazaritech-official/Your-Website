"use client";

import clsx from "clsx";
import { ShoppingCart, Sparkles, LogIn, UserPlus } from "lucide-react";
import UserMenu from "./UserMenu";
import type { NavbarProps } from "./types";

/* ─── RIGHT ACTIONS (Desktop) ───
   Cart button + PWA install + account chip / auth buttons. The account chip
   is the shared <UserMenu>, which carries the admin role gate. */
export default function DesktopActions({
  isMounted,
  isVerified,
  isAppInstalled,
  isiOS,
  showInstallButton,
  cartCount,
  cartBounce,
  tones,
  onOpenCartDrawer,
  handleInstallClick,
  onOpenLogin,
  onOpenSignup,
  className,
  ...userMenuProps
}: Pick<
  NavbarProps,
  | "isMounted"
  | "isVerified"
  | "isAppInstalled"
  | "isiOS"
  | "showInstallButton"
  | "cartCount"
  | "cartBounce"
  | "tones"
  | "onOpenCartDrawer"
  | "handleInstallClick"
  | "onOpenLogin"
  | "onOpenSignup"
  | "username"
  | "profilePic"
  | "role"
  | "isAdmin"
  | "wishlistCount"
  | "notifUnreadCount"
  | "userMenuOpen"
  | "userMenuRef"
  | "setUserMenuOpen"
  | "handleUserMenuToggle"
  | "handleAdminPage"
  | "handleLogout"
> & { className?: string }) {
  return (
    <div className={clsx("hidden md:flex shrink-0 items-center gap-1.5", className)}>
      {/* Cart icon */}
      <button
        type="button"
        onClick={onOpenCartDrawer}
        aria-label="Shopping Cart"
        className={clsx(
          "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-200 group border",
          tones.iconButtonTone,
        )}
      >
        <ShoppingCart
          size={17}
          className={clsx(
            "transition-all duration-300",
            cartBounce && "animate-cart-bounce"
          )}
        />
        {cartCount > 0 && (
          <span className={clsx(
            "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-gold px-1 text-[9px] font-bold leading-none text-white shadow-sm transition-all duration-300",
            cartBounce && "animate-badge-pop"
          )}>
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>

      {/* Install App */}
      {!isAppInstalled && showInstallButton && (
        <>
          <button
            onClick={handleInstallClick}
            className="rounded-lg bg-brand-gold px-3.5 py-2 text-[10px] font-bold text-white transition-colors duration-200 hover:bg-brand-gold-hover"
          >
            <span className="flex items-center gap-1">
              <Sparkles size={10} />
              {isiOS ? "Install" : "Download"}
            </span>
          </button>
        </>
      )}

      {/* Auth */}
      {isMounted && isVerified ? (
        <UserMenu {...userMenuProps} cartCount={cartCount} tones={tones} />
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenLogin}
            className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-brand-gold-hover"
          >
            <LogIn size={12} />
            Login
          </button>
          <button
            onClick={onOpenSignup}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-[11px] font-bold transition-colors duration-200",
              tones.chipTone,
            )}
          >
            <UserPlus size={12} />
            Sign Up
          </button>
        </div>
      )}
    </div>
  );
}
