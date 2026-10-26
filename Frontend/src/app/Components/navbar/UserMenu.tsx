"use client";

import Link from "next/link";
import clsx from "clsx";
import {
  ChevronDown,
  User,
  Package,
  Heart,
  ShoppingCart,
  Bell,
  MessageSquare,
  Gift,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import type { NavbarProps } from "./types";

/* ─── ACCOUNT CHIP + DROPDOWN (Desktop) ───
   ────────────────────────────────────────────────────────────────
   SECURITY-CRITICAL: this file contains the role-gated Admin Dashboard
   entry (`{isAdmin && …}` / `role === "rider"`). It is shared verbatim by
   every navbar design variant and never forks, so the gate cannot drift
   between designs. The container decides `isAdmin`; this file only
   renders it. Do not move this markup into a variant.
   ──────────────────────────────────────────────────────────────── */
export default function UserMenu({
  username,
  profilePic,
  role,
  isAdmin,
  cartCount,
  wishlistCount,
  notifUnreadCount,
  userMenuOpen,
  tones,
  userMenuRef,
  setUserMenuOpen,
  handleUserMenuToggle,
  handleAdminPage,
  handleLogout,
}: Pick<
  NavbarProps,
  | "username"
  | "profilePic"
  | "role"
  | "isAdmin"
  | "cartCount"
  | "wishlistCount"
  | "notifUnreadCount"
  | "userMenuOpen"
  | "tones"
  | "userMenuRef"
  | "setUserMenuOpen"
  | "handleUserMenuToggle"
  | "handleAdminPage"
  | "handleLogout"
>) {
  return (
    <div ref={userMenuRef} className="relative">
      <button
        onClick={handleUserMenuToggle}
        aria-expanded={userMenuOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
        className={clsx(
          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-200 group",
          tones.userChipTone,
        )}
      >
        {profilePic ? (
          <img
            src={profilePic}
            className="h-5 w-5 sm:h-6 sm:w-6 rounded-full object-cover ring-2 ring-brand-gold/30 transition-all"
            alt=""
          />
        ) : (
          <div className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-brand-gold text-[9px] font-bold text-white">
            {username?.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="max-w-[70px] truncate text-[11px] font-semibold capitalize leading-none">
          {username}
        </span>
        <ChevronDown
          size={9}
          className={clsx(
            "transition-transform duration-200",
            userMenuOpen && "rotate-180"
          )}
        />
      </button>

      {userMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface text-brand-navy shadow-lg shadow-black/5 z-50 animate-dropdown-fade">
            {/* User preview */}
            <div className="px-4 py-3.5 border-b border-line-soft bg-surface-muted/30">
              <div className="flex items-center gap-3">
                {profilePic ? (
                  <img src={profilePic} className="h-9 w-9 rounded-full object-cover ring-2 ring-brand-gold/20" alt="" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold text-sm font-bold text-white">
                    {username?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold capitalize leading-tight">{username}</p>
                  <p className="text-[10px] text-brand-gold font-semibold">Verified Account</p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1.5">
              <Link
                href="/profile"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <User size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                My Profile
              </Link>
              <Link
                href="/wishlist"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <Heart size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                Wishlist
                {wishlistCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold/15 px-1.5 text-[10px] font-bold text-brand-gold-hover">
                    {wishlistCount}
                  </span>
                )}
              </Link>
              <Link
                href="/profile/orders"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <Package size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                My Orders
              </Link>
              <Link
                href="/profile/referral"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <Gift size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                Referral Rewards
              </Link>
              <Link
                href="/chat"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <MessageSquare size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                Chat
              </Link>
              <Link
                href="/profile/notifications"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <Bell size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                Notifications
                {notifUnreadCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold/15 px-1.5 text-[10px] font-bold text-brand-gold-hover">
                    {notifUnreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/cart"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
              >
                <ShoppingCart size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                Shopping Cart
                {cartCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gold px-1.5 text-[8px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              {isAdmin && (
                <button
                  onClick={handleAdminPage}
                  className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
                >
                  <LayoutDashboard size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                  Admin Dashboard
                </button>
              )}
              {role === "rider" && (
                <Link
                  href="/rider"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
                >
                  <LayoutDashboard size={14} className="text-ink-subtle group-hover:text-brand-gold transition-colors" />
                  Rider Dashboard
                </Link>
              )}
            </div>

            <div className="border-t border-gray-50 p-1.5">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition-all group"
              >
                <LogOut size={14} className="group-hover:scale-110 transition-transform" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
