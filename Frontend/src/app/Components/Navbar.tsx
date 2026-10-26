"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "../Redux/store";
import { logout } from "../Redux/Features/authSlice";
import { openLogin, openSignup, openCartDrawer } from "../Redux/Features/modalSlice";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import useFetch, {
  baseUrl,
  showToast,
  clearAllFetchCache,
  fetchWishlistIds,
} from "../utils/commonFunctions";
import { useSocket } from "../utils/PusherSocketProvider";
import axios from "axios";
import { useBranding } from "./ThemeProvider";
import TopStrip from "./navbar/TopStrip";
import NotificationPrompt from "./navbar/NotificationPrompt";
import MobileDrawer from "./navbar/MobileDrawer";
import IosInstallModal from "./navbar/IosInstallModal";
import dynamic from "next/dynamic";
import NavbarVariantA from "./navbar/VariantA";
import type {
  NavbarProps,
  NavbarVariant,
  NavCategory,
  ProductSuggestion,
} from "./navbar/types";

// B and C are DORMANT: no call site passes `variant`, so Variant A is always
// rendered. They are code-split out of the initial bundle; the default path is
// unchanged.
const NavbarVariantB = dynamic(() => import("./navbar/VariantB"));
const NavbarVariantC = dynamic(() => import("./navbar/VariantC"));

/* ============================================================
   Navbar — CONTAINER
   ------------------------------------------------------------
   This file is the ONLY place that owns navbar behaviour: role
   resolution (which gates the admin entry), cart / wishlist /
   notification counts, search autocomplete, PWA install, logout,
   click-outside handling and every API call.

   The header's visuals live in ./navbar/*: shared presentational
   pieces plus three arrangements (VariantA/B/C) fed by the single
   `NavbarProps` contract. Swapping the arrangement changes the layout
   only — handlers and derived values are passed by identity, so a design
   change cannot change behaviour.

   SECURITY: `resolveDisplayRole` + `isAdmin` below decide whether the
   Admin Dashboard entry renders at all. Both the desktop gate
   (navbar/UserMenu.tsx) and the mobile gate (navbar/MobileDrawer.tsx) are
   shared by every variant, so the gate is design-independent.

   The default export and its prop signature are unchanged, so
   ClientLayout keeps rendering it as-is.
   ============================================================ */

export type { NavbarVariant } from "./navbar/types";

/**
 * The arrangement rendered when nothing (or an unknown value) is selected.
 * Phase B3 will feed the admin's saved choice in here; until then the
 * storefront renders Variant A, i.e. exactly what shipped before.
 */
export const DEFAULT_NAVBAR_VARIANT: NavbarVariant = "A";

const VARIANTS: Record<NavbarVariant, React.ComponentType<NavbarProps>> = {
  A: NavbarVariantA,
  B: NavbarVariantB,
  C: NavbarVariantC,
};

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface myResponseData {
  success: boolean;
  data: {
    username: string;
    email: string;
    password?: string | null;
    phoneNo?: number | null;
    googleId?: string | null;
    isAdmin: boolean;
    role?: string;
    isVerified: boolean;
    profilePic: string;
    createdAt?: string;
    updatedAt?: string;
  };
  message: string;
}

const Navbar: React.FC<{ variant?: NavbarVariant }> = ({
  variant = DEFAULT_NAVBAR_VARIANT,
}) => {
  // Admin-configured logo / site name / tagline (server-provided).
  const { logoUrl, siteName, tagline } = useBranding();
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const pathname = usePathname();

  const { username, isVerified, profilePic } = useSelector(
    (state: RootState) => state.auth,
  );
  const authData = useSelector((state: RootState) => state.auth);
  const isHomePage = pathname === "/";

  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartBounce, setCartBounce] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categoriesMenuOpen, setCategoriesMenuOpen] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchSeqRef = useRef(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [isiOS, setIsiOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  /**
   * Resolve the display role that gates the Admin Dashboard entry.
   * An explicit admin/rider role wins; otherwise the server's `isAdmin` flag is
   * authoritative. A plain "user" role string must NEVER mask `isAdmin: true`
   * — the old `role ?? (isAdmin ? ... )` fallback short-circuited on any truthy
   * role, which is exactly how the Admin Dashboard button disappeared for
   * Super Admins whose account carries the admin flag.
   */
  const resolveDisplayRole = (
    u: { role?: string | null; isAdmin?: boolean } | null | undefined,
  ): string => {
    if (!u) return "user";
    if (u.role === "superadmin" || u.role === "admin" || u.role === "rider") {
      return u.role;
    }
    if (u.isAdmin) return "superadmin";
    return u.role ?? "user";
  };

  const isAdmin = role === "admin" || role === "superadmin";
  const userMenuRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoriesMenuRef = useRef<HTMLDivElement>(null);
  const prevCartCount = useRef(cartCount);

  // Bounce cart icon when count changes
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      setCartBounce(true);
      const timer = setTimeout(() => setCartBounce(false), 400);
      prevCartCount.current = cartCount;
      return () => clearTimeout(timer);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(false);
      }
      if (!categoriesMenuRef.current || !categoriesMenuRef.current.contains(event.target as Node)) {
        setCategoriesMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    if (userMenuOpen || categoryDropdownOpen || suggestionsOpen || categoriesMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen, categoryDropdownOpen, suggestionsOpen, categoriesMenuOpen]);

  const isStandaloneMode = () => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as any)?.standalone === true
    );
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load user role from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = window.localStorage.getItem("user");
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setRole(resolveDisplayRole(parsedUser));
        } catch {
          setRole("user");
        }
      } else {
        setRole("user");
      }
    }
  }, []);

  // Local cart count
  useEffect(() => {
    if (authData.username) return;
    const updateCartCount = () => {
      try {
        const cart = JSON.parse(localStorage.getItem("irhasinn_cart") ?? "[]");
        setCartCount(cart.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0));
      } catch {
        setCartCount(0);
      }
    };
    updateCartCount();
    // Event-driven: refresh only when the cart actually changes. Every cart
    // mutation (add/update/remove, guest + logged-in) dispatches
    // `cart-updated`; other tabs sync via the `storage` event. No polling —
    // the old 1s interval re-parsed localStorage every second, forever.
    window.addEventListener("storage", updateCartCount);
    window.addEventListener("cart-updated", updateCartCount);
    return () => {
      window.removeEventListener("storage", updateCartCount);
      window.removeEventListener("cart-updated", updateCartCount);
    };
  }, [authData.username]);

  // Wishlist count — reads the shared wishlist-id cache (one request per
  // session, shared with every ProductCard on the page) instead of firing
  // its own /auth/wishlist request.
  useEffect(() => {
    if (!authData.username) return;
    const fetchWishlistCount = async () => {
      try {
        const ids = await fetchWishlistIds();
        setWishlistCount(ids.length);
      } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
    };
    fetchWishlistCount();
    // Refresh wishlist count when page focuses — force a server sync so
    // changes made in another tab are reflected here (still deduped).
    const refreshOnFocus = () =>
      fetchWishlistIds(true).then((ids) => setWishlistCount(ids.length)).catch(() => { });
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [authData.username]);

  // Search autocomplete — uses the full search endpoint so the dropdown
  // shows the same results the AI Assistant and products page would return.
  //
  // F-013: debounce timer lives in a ref, not React state, so each keystroke
  // no longer triggers a full Navbar re-render (avoids ~1650-line component
  // re-rendering just to update the timer reference).
  //
  // F-014: a monotonically increasing request sequence number ensures that if
  // request N resolves after request N+2, the stale response is discarded
  // rather than overwriting newer suggestions.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      try {
        const res = await axios.get(`${baseUrl}product/search?q=${encodeURIComponent(q)}&limit=8`);
        // Discard if a newer request was dispatched in the meantime.
        if (seq !== searchSeqRef.current) return;
        const items = res.data?.data?.products || [];
        setSuggestions(Array.isArray(items) ? items : []);
        setSuggestionsOpen(true);
        setSelectedSuggestionIndex(-1);
      } catch {
        // Silently ignore 429 / network errors — previous suggestions stay
        // visible so the user isn't staring at a suddenly-empty dropdown.
        // Only clear on genuine unexpected failures (non-429).
      }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  // ─── Notification States ───
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);

  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  // Check notification permission state for prompt
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !authData.username) return;
    const dismissed = localStorage.getItem("irhasinn_notif_prompt_dismissed");
    if (Notification.permission === "default" && !dismissed) {
      setShowNotifPrompt(true);
    }
  }, [authData.username]);

  const handleEnableNotifications = async () => {
    try {
      const { subscribe } = await import("../utils/notificationClient");
      const success = await subscribe();
      if (success) {
        showToast("Notifications enabled!", "success");
      }
    } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
    setShowNotifPrompt(false);
  };

  const handleDismissNotifPrompt = () => {
    setShowNotifPrompt(false);
    try {
      localStorage.setItem("irhasinn_notif_prompt_dismissed", "true");
    } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
  };

  const fetchNotifCount = useCallback(async () => {
    if (!authData.username) return;
    try {
      const res = await axios.get(`${baseUrl}notifications/unread-count`, { withCredentials: true });
      const count = res.data?.data?.unreadCount ?? 0;
      setNotifUnreadCount(count);
    } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
  }, [authData.username]);

  // Initial unread-count fetch — live updates arrive via the socket
  // `notification:new` event below and the window-focus refresh.
  useEffect(() => {
    if (!authData.username) return;
    fetchNotifCount();
  }, [authData.username, fetchNotifCount]);

  // Also refresh on window focus
  useEffect(() => {
    if (!authData.username) return;
    const handleFocus = () => fetchNotifCount();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [authData.username, fetchNotifCount]);

  // Refresh instantly when a new notification arrives over the socket
  // (e.g. order reached/delivered). There is no polling: the badge refreshes
  // on mount, on this socket event, and on window focus.
  const { onNewNotification, offNewNotification } = useSocket();
  useEffect(() => {
    if (!authData.username) return;
    const handleNewNotif = () => fetchNotifCount();
    onNewNotification(handleNewNotif);
    return () => offNewNotification(handleNewNotif);
  }, [authData.username, fetchNotifCount, onNewNotification, offNewNotification]);

  // Backend cart count
  useEffect(() => {
    if (!authData.username) return;
    const fetchBackendCart = async () => {
      try {
        const res = await axios.get(`${baseUrl}cart/`, { withCredentials: true });
        const items = res.data.data || [];
        const count = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
        setCartCount(count);
        // Broadcast to MobileBottomNav so it stays in sync without a duplicate API call
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cart-count-updated", { detail: { count } }));
        }
      } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
    };
    fetchBackendCart();
    const handleCartUpdate = () => fetchBackendCart();
    window.addEventListener("cart-updated", handleCartUpdate);
    return () => window.removeEventListener("cart-updated", handleCartUpdate);
  }, [authData.username]);

  // PWA install — with localStorage persistence & iOS detection
  useEffect(() => {
    // Detect iOS Safari
    const iOS =
      (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream) ||
      (navigator.maxTouchPoints > 0 && navigator.platform === 'MacIntel'); // iPadOS 13+
    setIsiOS(iOS);

    // Check localStorage for already installed
    let installed = false;
    try {
      installed = localStorage.getItem("irhasinn_app_installed") === "true";
    } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }

    const handleBeforeInstallPrompt = (event: any) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
      // Persist to localStorage
      try {
        localStorage.setItem("irhasinn_app_installed", "true");
      } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
    };

    // Check standalone mode OR localStorage flag
    const standalone = isStandaloneMode();
    setIsAppInstalled(standalone || installed);

    if (!standalone && !installed) {
      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    }
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Body scroll lock when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [menuOpen]);

  // Fetch fresh user data for role sync — cached 30s per username (the URL
  // includes the username, and clearAllFetchCache runs on logout, so a
  // different user / a fresh login always gets fresh data).
  const { data: userData } = useFetch<myResponseData>(
    authData.username ? `${baseUrl}auth/getUser/${authData.username}` : "",
    { cacheKey: "user_profile", staleTime: 30 * 1000 },
  );

  // Categories for the navbar mega-menu (desktop) + accordion (mobile).
  // getAllCategories populates each category's `subcategories`, so one fetch
  // powers both the homepage strip and the navbar dropdown.
  const { data: navCatRes } = useFetch<any>(
    `${baseUrl}category/getAllCategories`,
    { cacheKey: "categories", staleTime: 5 * 60 * 1000 },
  );
  const [navCategories, setNavCategories] = useState<NavCategory[]>([]);

  useEffect(() => {
    if (navCatRes?.data) {
      setNavCategories(Array.isArray(navCatRes.data) ? navCatRes.data : []);
    }
  }, [navCatRes]);

  useEffect(() => {
    if (userData?.data) {
      const freshRole = resolveDisplayRole(userData.data);
      setRole(freshRole);
      const stored = localStorage.getItem("user");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.role !== freshRole) {
            localStorage.setItem("user", JSON.stringify({ ...parsed, role: freshRole }));
          }
        } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
      }
    }
  }, [userData]);

  // Scroll handler for background change
  const handleScroll = useCallback(() => {
    setIsScrolled(window.scrollY > 40);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Search handler
  const handleSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setMenuOpen(false);
    let params = `search=${encodeURIComponent(query)}`;
    if (selectedCategory !== "All") {
      params += `&category=${encodeURIComponent(selectedCategory)}`;
    }
    router.push(`/productsPage?${params}`);
  };

  /* ── Navbar surface tokens ────────────────────────────────────────
     The header has exactly two surfaces: DARK (navy — every non-home
     page, and the homepage while it still overlaps the hero) and LIGHT
     (the homepage once scrolled). Previously that same 3-branch ternery
     was re-written inline at nine call sites, which is how the header
     drifted out of sync. These tokens are the single source of truth;
     each one reproduces its original branch exactly.
         onDark = !isHomePage || !isScrolled                              */
  const onDark = !isHomePage || !isScrolled;

  const tones = {
    navbarClasses: clsx(
      "transition-colors duration-300 ease-out",
      onDark
        ? "bg-brand-navy text-white border-b border-white/5"
        : "bg-surface/95 backdrop-blur-xl shadow-sm border-b border-line",
    ),
    brandTone: onDark ? "text-white" : "text-brand-navy",
    taglineTone: onDark ? "text-white/60" : "text-brand-gold",
    linkTone: onDark
      ? "text-white/80 hover:text-white"
      : "text-brand-navy/70 hover:text-brand-navy",
    /* Icon buttons (cart, mobile cart, hamburger, user chip) */
    iconTone: onDark
      ? "text-white/80 hover:text-white hover:bg-surface/10"
      : "text-brand-navy hover:bg-surface-muted",
    iconButtonTone: onDark
      ? "border-white/15 text-white/80 hover:text-white hover:bg-surface/10"
      : "bg-surface border-line text-brand-navy hover:text-brand-gold-hover hover:border-brand-gold",
    userChipTone: onDark
      ? "border-white/15 bg-surface/10 text-white hover:bg-surface/15"
      : "bg-surface border-line text-brand-navy hover:border-brand-gold",
    /* Glass chip on dark, solid navy chip on light */
    chipTone: onDark
      ? "border border-white/20 bg-surface/10 text-white hover:bg-surface/15 hover:border-white/40"
      : "bg-brand-navy text-white hover:bg-brand-gold",
  };

  // Logout — POST (never GET: a GET logout could be triggered by <img>/prefetch
  // requests) and withCredentials so the Set-Cookie clear is accepted cross-site.
  const handleLogout = async () => {
    dispatch(logout());
    try {
      await axios.post(`${baseUrl}auth/logout`, {}, { withCredentials: true });
    } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
    try {
      localStorage.removeItem("irhasinn_cart");
      localStorage.removeItem("irhasinn_wishlist_ids");
    } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
    // Never let the next signed-in user see this user's cached admin data.
    clearAllFetchCache();
    setUserMenuOpen(false);
    setMenuOpen(false);
    window.location.href = "/";
  };

  // PWA install click
  const handleInstallClick = async () => {
    // iOS fallback — show instructions instead of native prompt
    if (isiOS) {
      setShowIOSInstructions(true);
      return;
    }
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        try {
          localStorage.setItem("irhasinn_app_installed", "true");
        } catch (err) { console.error("[silent-catch Navbar.tsx]", err); }
      }
    } catch {
      /* user cancelled */
    }
  };

  const handleUserMenuToggle = () => setUserMenuOpen((prev) => !prev);

  const handleAdminPage = () => {
    setUserMenuOpen(false);
    if (isAdmin) {
      window.location.href = "/Admin/Overview";
    } else {
      showToast("Unauthorized: Admin access only", "error");
    }
  };

  /* ── Small derived UI handlers handed to the presentational pieces ── */

  const toggleCategoriesMenu = () => setCategoriesMenuOpen((prev) => !prev);
  const toggleCategoryDropdown = () => setCategoryDropdownOpen((prev) => !prev);

  /** Desktop hash link: smooth-scroll on the homepage, route-push elsewhere. */
  const onDesktopHashLink = (href: string) => {
    if (isHomePage) {
      const el = document.getElementById(href.replace("/#", ""));
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push(href);
    }
  };

  /** Mobile drawer hash link: close the drawer first, then scroll/push. */
  const onMobileHashLink = (href: string) => {
    setMenuOpen(false);
    if (isHomePage) {
      const el = document.getElementById(href.replace("/#", ""));
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push(href);
    }
  };

  /**
   * Mobile category row: expand when there are subcategories, otherwise
   * close the drawer and navigate straight to the category.
   */
  const onMobileCategoryTap = (cat: NavCategory) => {
    const subs = cat.subcategories || [];
    if (subs.length > 0) {
      setMobileCatOpen(mobileCatOpen === cat._id ? null : cat._id);
    } else {
      setMenuOpen(false);
      router.push(`/productsPage?category=${cat._id}`);
    }
  };

  const navigate = (path: string) => router.push(path);

  const onSuggestionSelect = (suggestion: ProductSuggestion) => {
    setSuggestionsOpen(false);
    setSearchQuery("");
    router.push(`/product/${suggestion._id}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        Math.min(prev + 1, suggestions.length - 1),
      );
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1));
    }
    if (e.key === "Escape") {
      setSuggestionsOpen(false);
    }
  };

  const onGoToEditProfile = () => {
    setMenuOpen(false);
    window.location.href = "/editProfile";
  };

  const onOpenLogin = () => {
    setMenuOpen(false);
    dispatch(openLogin());
  };

  const onOpenSignup = () => {
    setMenuOpen(false);
    dispatch(openSignup());
  };

  const onOpenCartDrawer = () => dispatch(openCartDrawer());

  const variantProps: NavbarProps = {
    logoUrl,
    siteName,
    tagline,

    isHomePage,
    onDark,

    isMounted,
    isVerified,
    username,
    profilePic,
    role,
    isAdmin,

    cartCount,
    cartBounce,
    wishlistCount,
    notifUnreadCount,

    menuOpen,
    userMenuOpen,
    categoriesMenuOpen,
    categoryDropdownOpen,
    mobileCatOpen,
    searchFocused,

    searchQuery,
    selectedCategory,
    suggestions,
    suggestionsOpen,
    selectedSuggestionIndex,

    navCategories,

    isAppInstalled,
    isiOS,
    showInstallButton: !isAppInstalled && (!!deferredPrompt || isiOS),
    showIOSInstructions,

    showNotifPrompt,
    handleEnableNotifications,
    handleDismissNotifPrompt,

    tones,

    userMenuRef,
    categoryDropdownRef,
    categoriesMenuRef,
    searchContainerRef,

    setMenuOpen,
    setUserMenuOpen,
    setCategoriesMenuOpen,
    setCategoryDropdownOpen,
    setMobileCatOpen,
    setSearchFocused,
    setSearchQuery,
    setSelectedCategory,
    setSuggestionsOpen,
    setSelectedSuggestionIndex,

    toggleCategoriesMenu,
    toggleCategoryDropdown,
    handleUserMenuToggle,

    onDesktopHashLink,
    onMobileHashLink,
    onMobileCategoryTap,
    navigate,
    onSuggestionSelect,
    onGoToEditProfile,

    handleSearch,
    handleSearchKeyDown,
    handleAdminPage,
    handleLogout,
    handleInstallClick,
    dismissIOSInstructions: () => setShowIOSInstructions(false),

    onOpenLogin,
    onOpenSignup,
    onOpenCartDrawer,
  };

  const Variant = VARIANTS[variant] ?? NavbarVariantA;

  return (
    <div className="sticky top-0 z-[60] font-sans">
      <TopStrip {...variantProps} />

      {showNotifPrompt && isMounted && isVerified && (
        <NotificationPrompt {...variantProps} />
      )}

      <Variant {...variantProps} />

      <MobileDrawer {...variantProps} />

      {showIOSInstructions && <IosInstallModal {...variantProps} />}
    </div>
  );
};

export default Navbar;
