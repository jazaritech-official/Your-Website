import type { FormEvent, KeyboardEvent, RefObject } from "react";

/* ============================================================
   Navbar — shared variant contract
   ------------------------------------------------------------
   DESIGN-VARIANT SWITCHER, PART B.

   Golden rule: switching the navbar's VISUAL design must never change
   what it DOES. All state, side effects, API calls, role resolution and
   business rules stay inside the container (Components/Navbar.tsx);
   every piece below it is purely presentational and is fed by this one
   interface.

   SECURITY NOTE — the role-gated Admin Dashboard entry lives in
   ./UserMenu.tsx (desktop dropdown) and ./MobileDrawer.tsx (mobile).
   Those two files are shared by every variant, so the admin gate is
   literally the same markup regardless of design. Do not fork them.
   ============================================================ */

export type NavbarVariant = "A" | "B" | "C";

export interface NavCategory {
  _id: string;
  name: string;
  image?: string;
  subcategories?: Array<{ _id: string; name: string; image?: string }>;
}

export interface ProductSuggestion {
  _id: string;
  name: string;
  price?: number;
  brand?: string;
  images?: Array<{ url: string }>;
}

/**
 * Header surface + tone tokens. The header has exactly two surfaces —
 * DARK (navy: every non-home page, and the homepage while it overlaps the
 * hero) and LIGHT (the homepage once scrolled). These are derived once by
 * the container and passed down, so no presentational component ever
 * re-implements the branch.
 */
export interface NavbarTones {
  navbarClasses: string;
  brandTone: string;
  taglineTone: string;
  linkTone: string;
  iconTone: string;
  iconButtonTone: string;
  userChipTone: string;
  chipTone: string;
}

/** Everything a presentational navbar piece is allowed to render from. */
export interface NavbarProps {
  /* ── Branding (server-provided) ── */
  logoUrl: string;
  siteName: string;
  tagline: string;

  /* ── Layout derivation ── */
  isHomePage: boolean;
  onDark: boolean;

  /* ── Auth / role ── */
  isMounted: boolean;
  isVerified: boolean;
  username: string | null;
  profilePic: string | null;
  role: string | null;
  isAdmin: boolean;

  /* ── Live counts ── */
  cartCount: number;
  cartBounce: boolean;
  wishlistCount: number;
  notifUnreadCount: number;

  /* ── Open/closed UI state ── */
  menuOpen: boolean;
  userMenuOpen: boolean;
  categoriesMenuOpen: boolean;
  categoryDropdownOpen: boolean;
  mobileCatOpen: string | null;
  searchFocused: boolean;

  /* ── Search ── */
  searchQuery: string;
  selectedCategory: string;
  suggestions: ProductSuggestion[];
  suggestionsOpen: boolean;
  selectedSuggestionIndex: number;

  /* ── Data ── */
  navCategories: NavCategory[];

  /* ── PWA install ── */
  isAppInstalled: boolean;
  isiOS: boolean;
  /** !isAppInstalled && (deferredPrompt || isiOS) — computed by the container. */
  showInstallButton: boolean;
  showIOSInstructions: boolean;

  /* ── Notification permission prompt (banner above the navbar) ── */
  showNotifPrompt: boolean;
  handleEnableNotifications: () => void;
  handleDismissNotifPrompt: () => void;

  /* ── Derived tone tokens ── */
  tones: NavbarTones;

  /* ── Click-outside refs ── */
  userMenuRef: RefObject<HTMLDivElement | null>;
  categoryDropdownRef: RefObject<HTMLDivElement | null>;
  categoriesMenuRef: RefObject<HTMLDivElement | null>;
  searchContainerRef: RefObject<HTMLDivElement | null>;

  /* ── State setters ── */
  setMenuOpen: (open: boolean) => void;
  setUserMenuOpen: (open: boolean) => void;
  setCategoriesMenuOpen: (open: boolean) => void;
  setCategoryDropdownOpen: (open: boolean) => void;
  setMobileCatOpen: (id: string | null) => void;
  setSearchFocused: (focused: boolean) => void;
  setSearchQuery: (value: string) => void;
  setSelectedCategory: (value: string) => void;
  setSuggestionsOpen: (open: boolean) => void;
  setSelectedSuggestionIndex: (index: number) => void;

  /* ── Small derived UI handlers ── */
  toggleCategoriesMenu: () => void;
  toggleCategoryDropdown: () => void;
  handleUserMenuToggle: () => void;

  /* ── Navigation ── */
  /** Desktop hash-link behaviour: smooth-scroll on home, push otherwise. */
  onDesktopHashLink: (href: string) => void;
  /** Mobile drawer hash-link behaviour: close the drawer first, then scroll/push. */
  onMobileHashLink: (href: string) => void;
  /** Mobile drawer category tap: expand when it has subcategories, else navigate. */
  onMobileCategoryTap: (category: NavCategory) => void;
  /** Generic programmatic navigation (drawer "All Products", search submit). */
  navigate: (path: string) => void;
  onSuggestionSelect: (suggestion: ProductSuggestion) => void;
  onGoToEditProfile: () => void;

  /* ── Business handlers (owned by the container) ── */
  handleSearch: (event?: FormEvent) => void;
  handleSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleAdminPage: () => void;
  handleLogout: () => void;
  handleInstallClick: () => void;
  dismissIOSInstructions: () => void;

  /* ── Modal dispatchers (container owns redux) ── */
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onOpenCartDrawer: () => void;
}
