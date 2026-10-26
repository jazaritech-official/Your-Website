"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  X,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  User,
  Package,
  Gift,
  Bell,
  MessageSquare,
  Sparkles,
  LogIn,
  UserPlus,
} from "lucide-react";
import { drawerOverlay, drawerPanel } from "../../utils/motion";
import { NAV_LINKS } from "./constants";
import type { NavbarProps } from "./types";

/* ─── MOBILE DRAWER ───
   Slide-in panel + backdrop fade, with a smooth exit — driven by
   framer-motion (presets in utils/motion.ts). The drawer's state
   (menuOpen) and content are untouched; only the two outer layers
   are animated. Reduced motion: <MotionConfig reducedMotion="user">
   in ClientLayout disables the x-slide for those users.

   SECURITY-CRITICAL: the `{isAdmin ? …Admin Panel… : …Logout…}` gate below
   is the mobile half of the role-gated admin entry. Shared verbatim by all
   variants — do not fork. */
export default function MobileDrawer({
  menuOpen,
  setMenuOpen,
  logoUrl,
  siteName,
  isMounted,
  isVerified,
  username,
  profilePic,
  isAdmin,
  searchQuery,
  setSearchQuery,
  navCategories,
  mobileCatOpen,
  isAppInstalled,
  isiOS,
  showInstallButton,
  onMobileHashLink,
  onMobileCategoryTap,
  navigate,
  handleSearch,
  handleAdminPage,
  handleLogout,
  handleInstallClick,
  onOpenLogin,
  onOpenSignup,
  onGoToEditProfile,
}: Pick<
  NavbarProps,
  | "menuOpen"
  | "setMenuOpen"
  | "logoUrl"
  | "siteName"
  | "isMounted"
  | "isVerified"
  | "username"
  | "profilePic"
  | "isAdmin"
  | "searchQuery"
  | "setSearchQuery"
  | "navCategories"
  | "mobileCatOpen"
  | "isAppInstalled"
  | "isiOS"
  | "showInstallButton"
  | "onMobileHashLink"
  | "onMobileCategoryTap"
  | "navigate"
  | "handleSearch"
  | "handleAdminPage"
  | "handleLogout"
  | "handleInstallClick"
  | "onOpenLogin"
  | "onOpenSignup"
  | "onGoToEditProfile"
>) {
  return (
    <AnimatePresence initial={false}>
      {menuOpen && (
        <motion.div
          className="fixed inset-0 z-[100] md:hidden"
          variants={{ closed: {}, open: {} }}
          initial="closed"
          animate="open"
          exit="closed"
        >
          <motion.div
            variants={drawerOverlay}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <motion.div
            variants={drawerPanel}
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-line-soft p-4 sm:p-5">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 group"
              >
                <img
                  src={logoUrl}
                  alt={siteName}
                  className="h-10 w-auto object-contain"
                />
                <div>
                  <span className="block font-bold text-sm text-brand-navy leading-tight">
                    {siteName}
                  </span>
                  <span className="text-[9px] text-brand-gold font-semibold tracking-wider uppercase">
                    Premium Shopping
                  </span>
                </div>
              </Link>
              <button
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-brand-navy hover:bg-surface-muted transition-colors duration-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="border-b border-line-soft p-4 sm:p-5">
              <form onSubmit={handleSearch}>
                <div className="flex items-center rounded-lg border border-line bg-surface-muted/30 p-1 focus-within:border-brand-gold focus-within:bg-surface focus-within:shadow-[0_0_0_2px_rgba(200,168,78,0.15)] transition-colors duration-200">
                  <Search size={14} className="ml-3 text-ink-subtle" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products..."
                    aria-label="Search products"
                    autoComplete="off"
                    className="flex-1 bg-transparent px-2.5 py-2.5 text-sm text-brand-navy outline-none placeholder:text-ink-subtle"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-gold px-3.5 py-2 text-[10px] font-bold text-white hover:bg-brand-gold-hover transition-colors duration-200"
                  >
                    Search
                  </button>
                </div>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Nav Links */}
              <div className="p-4 sm:p-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-subtle mb-3">
                  Navigation
                </p>
                <div className="space-y-0.5">
                  {NAV_LINKS.map((link) =>
                    link.isHash ? (
                      <button
                        key={link.name}
                        onClick={() => onMobileHashLink(link.href)}
                        className="flex w-full items-center justify-between rounded-lg px-3.5 py-3 text-sm font-semibold text-brand-navy hover:bg-surface-muted/30 hover:text-brand-gold transition-colors group"
                      >
                        {link.name}
                        <ChevronRight size={14} className="text-ink-subtle group-hover:text-brand-gold group-hover:translate-x-1 transition-all" />
                      </button>
                    ) : (
                      <Link
                        key={link.name}
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold text-brand-navy hover:bg-surface-muted/30 hover:text-brand-gold transition-all group"
                      >
                        {link.name}
                        <ChevronRight size={14} className="text-ink-subtle group-hover:text-brand-gold group-hover:translate-x-1 transition-all" />
                      </Link>
                    ),
                  )}
                </div>
              </div>

              {/* Categories — tappable accordion (mobile) */}
              <div className="border-t border-line-soft p-4 sm:p-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-subtle mb-3">
                  Categories
                </p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/productsPage");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-navy transition-colors hover:bg-surface-muted/30 hover:text-brand-gold"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold">
                      <LayoutGrid size={15} />
                    </span>
                    All Products
                  </button>
                  {navCategories.length === 0 ? (
                    <p className="px-3 py-2 text-xs font-medium text-ink-subtle">
                      No categories yet.
                    </p>
                  ) : (
                    navCategories.map((cat) => {
                      const subs = cat.subcategories || [];
                      const open = mobileCatOpen === cat._id;
                      return (
                        <div
                          key={cat._id}
                          className="overflow-hidden rounded-xl border border-line-soft"
                        >
                          <button
                            onClick={() => onMobileCategoryTap(cat)}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted/30"
                          >
                            <img
                              src={cat.image || "/carousel/Clothes.jpg"}
                              alt={cat.name}
                              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-surface-muted"
                            />
                            <span className="flex-1 text-sm font-semibold text-brand-navy">
                              {cat.name}
                            </span>
                            <ChevronDown
                              size={15}
                              className={`text-ink-subtle transition-transform duration-300 ${open ? "rotate-180" : ""}`}
                            />
                          </button>
                          <div
                            className={`grid transition-all duration-300 ease-in-out ${open
                              ? "grid-rows-[1fr] opacity-100"
                              : "grid-rows-[0fr] opacity-0"
                              }`}
                          >
                            <div className="overflow-hidden">
                              <div className="space-y-0.5 px-3 pb-2.5">
                                {subs.map((sub) => (
                                  <Link
                                    key={sub._id}
                                    href={`/productsPage?category=${cat._id}&subcategory=${sub._id}`}
                                    onClick={() => setMenuOpen(false)}
                                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-brand-gold/10"
                                  >
                                    <img
                                      src={sub.image || "/carousel/Clothes.jpg"}
                                      alt={sub.name}
                                      className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-surface-muted"
                                    />
                                    <span className="text-xs font-semibold text-slate-600">
                                      {sub.name}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Auth / User Section */}
            <div className="border-t border-line-soft p-4 sm:p-5 bg-surface-muted/30/60">
              {isMounted && isVerified ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl bg-surface border border-line-soft p-3 shadow-sm">
                    {profilePic ? (
                      <img
                        src={profilePic}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-brand-gold/20"
                        alt=""
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold font-bold text-white text-sm">
                        {username?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold capitalize text-brand-navy truncate">
                        {username}
                      </p>
                      <p className="text-[9px] font-semibold text-brand-gold">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-gold mr-1 align-middle" />
                        Verified Account
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center gap-2 rounded-lg bg-surface border border-line-soft py-2.5 text-[11px] font-semibold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200 shadow-sm"
                    >
                      <User size={13} /> Profile
                    </Link>
                    <Link
                      href="/profile/orders"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center gap-2 rounded-lg bg-surface border border-line-soft py-2.5 text-[11px] font-semibold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200 shadow-sm"
                    >
                      <Package size={13} /> Orders
                    </Link>
                    <Link
                      href="/profile/referral"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center gap-2 rounded-lg bg-surface border border-line-soft py-2.5 text-[11px] font-semibold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200 shadow-sm"
                    >
                      <Gift size={13} /> Referral
                    </Link>
                  </div>
                  <Link
                    href="/profile/notifications"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-surface border border-line-soft py-2.5 text-[11px] font-semibold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200 shadow-sm"
                  >
                    <Bell size={13} /> Alerts
                  </Link>
                  <Link
                    href="/chat"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-surface border border-line-soft py-2.5 text-[11px] font-semibold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200 shadow-sm"
                  >
                    <MessageSquare size={13} /> Chat
                  </Link>

                  {!isAppInstalled && showInstallButton && (
                    <button
                      onClick={handleInstallClick}
                      className="w-full rounded-lg bg-brand-gold py-3 text-xs font-bold text-white hover:bg-brand-gold-hover transition-colors duration-200"
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <Sparkles size={14} />
                        {isiOS ? "Install on iOS" : "Download App"}
                      </span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={onGoToEditProfile}
                      className="rounded-lg border border-line bg-surface py-2.5 text-[11px] font-semibold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200"
                    >
                      Edit Profile
                    </button>
                    {isAdmin ? (
                      <button
                        onClick={handleAdminPage}
                        className="rounded-lg bg-brand-navy py-2.5 text-[11px] font-semibold text-white hover:bg-brand-gold transition-colors duration-200"
                      >
                        Admin Panel
                      </button>
                    ) : (
                      <button
                        onClick={handleLogout}
                        className="rounded-lg bg-brand-navy py-2.5 text-[11px] font-semibold text-white hover:bg-red-500 transition-colors duration-200"
                      >
                        Logout
                      </button>
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      onClick={handleLogout}
                      className="w-full rounded-lg border border-line bg-surface py-2.5 text-[11px] font-semibold text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors duration-200"
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenLogin();
                    }}
                    className="flex items-center justify-center gap-2 rounded-lg bg-brand-gold py-3 text-xs font-bold text-white hover:bg-brand-gold-hover transition-colors duration-200"
                  >
                    <LogIn size={14} /> Login
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSignup();
                    }}
                    className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface py-3 text-xs font-bold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors duration-200"
                  >
                    <UserPlus size={14} /> Sign Up
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
