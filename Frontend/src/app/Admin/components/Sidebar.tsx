"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Users,
  X,
  MessageSquare,
  Radio,
  MapPin,
  Gift,
  UploadCloud,
  Layers,
  Bike,
  Star,
  LogOut,
  Palette,
  Sparkles,
  FileText,
} from "lucide-react";

interface SidebarChildLink {
  name: string;
  href: string;
}

interface SidebarLink {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  /** Optional sub-items — renders as an expandable parent navigation item. */
  children?: SidebarChildLink[];
}

const sidebarLinks: SidebarLink[] = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/Admin/Overview" },
  {
    name: "Products",
    icon: PackageSearch,
    href: "/Admin/Products",
    // "All Products" is the existing listing; "Add Product" is the dedicated
    // page that replaced the New Product modal.
    children: [
      { name: "All Products", href: "/Admin/Products" },
      { name: "Add Product", href: "/Admin/Products/AddProduct" },
    ],
  },
  { name: "Bulk Upload", icon: UploadCloud, href: "/Admin/BulkUpload" },
  { name: "Categories", icon: Tags, href: "/Admin/Categories" },
  { name: "Homepage Banners", icon: ImageIcon, href: "/Admin/HomepageBanners" },
  { name: "Home Sections", icon: Layers, href: "/Admin/HomeSections" },
  { name: "Orders", icon: ShoppingBag, href: "/Admin/Orders" },
  { name: "Order Tracking", icon: MapPin, href: "/Admin/Tracking" },
  { name: "Chats", icon: MessageSquare, href: "/Admin/Chats" },
  { name: "Carts", icon: ShoppingCart, href: "/Admin/Carts" },
  { name: "Customers", icon: Users, href: "/Admin/Users" },
  { name: "Reviews", icon: Star, href: "/Admin/Reviews" },
  { name: "Online Users", icon: Radio, href: "/Admin/OnlineUsers" },
  { name: "Referrals", icon: Gift, href: "/Admin/Referrals" },
  { name: "Analytics", icon: BarChart3, href: "/Admin/Analytics" },
  { name: "Website Appearance", icon: Palette, href: "/Admin/Appearance" },
  { name: "Showcase Studio", icon: Sparkles, href: "/Admin/ShowcaseStudio" },
  { name: "Pitch Records", icon: FileText, href: "/Admin/PitchRecords" },
  { name: "Settings", icon: Settings, href: "/Admin/Settings" },
  { name: "Rider Applications", icon: Bike, href: "/Admin/RiderApplications" },
];

/** Jazari Tech internal sales tooling — hidden from the reseller-admin tier
 *  to match the SUPERADMIN_ONLY_ROUTES guard (F-14). The backend enforces
 *  the same tier via requireSuperAdmin. */
const SUPERADMIN_SIDEBAR_HREFS = new Set([
  "/Admin/ShowcaseStudio",
  "/Admin/PitchRecords",
]);

/** A parent section owns a route when the path matches or is nested under it. */
const routeInSection = (pathname: string | null, href: string) =>
  !!pathname && (pathname === href || pathname.startsWith(href + "/"));

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const pathname = usePathname();
  const submenuIdBase = useId();
  const [adminName, setAdminName] = useState("Admin");
  const [adminRole, setAdminRole] = useState<string>("admin");
  const [profilePic, setProfilePic] = useState<string | null>(null);
  // Expandable section state — a section the current route belongs to starts
  // expanded (Products → All Products / Add Product).
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      sidebarLinks.forEach((link) => {
        if (link.children?.length && routeInSection(pathname, link.href)) {
          initial[link.name] = true;
        }
      });
      return initial;
    },
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = window.localStorage.getItem("user");
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed?.username) setAdminName(parsed.username);
          setAdminRole(parsed?.role ?? (parsed?.isAdmin ? "superadmin" : "user"));
          if (parsed?.profilePic) setProfilePic(parsed.profilePic);
        } catch {
          setAdminName("Admin");
          setAdminRole("admin");
        }
      }
    }
  }, []);

  // Keep the section that owns the current route expanded while the admin
  // navigates inside it (a manual collapse is respected until then).
  useEffect(() => {
    const owner = sidebarLinks.find(
      (link) => link.children?.length && routeInSection(pathname, link.href),
    );
    if (!owner) return;
    setExpandedMenus((prev) =>
      prev[owner.name] ? prev : { ...prev, [owner.name]: true },
    );
  }, [pathname]);

  const toggleMenu = (name: string) =>
    setExpandedMenus((prev) => ({ ...prev, [name]: !prev[name] }));

  const roleLabel = adminRole === "superadmin" ? "Super Admin" : "Administrator";

  return (
    <aside className="flex h-full w-72 flex-col bg-[#1B2027]">
      {/* Logo lockup */}
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link href="/" className="flex flex-col items-center" onClick={onNavigate}>
          <div className="flex items-center justify-center rounded-lg border border-[#C9A227]/40 bg-[#1B2027] px-3 py-1.5">
            <span className="text-sm font-black uppercase tracking-[0.15em] text-[#C9A227]">
              IRHAS&apos;INN
            </span>
          </div>
          <span className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.25em] text-white/40">
            Customize Product All In One
          </span>
        </Link>
        {onNavigate && (
          <button
            onClick={onNavigate}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
          Navigation
        </p>
        {sidebarLinks
          .filter(
            (link) =>
              !SUPERADMIN_SIDEBAR_HREFS.has(link.href) ||
              adminRole === "superadmin",
          )
          .map((link) => {
          const Icon = link.icon;
          const isActive = routeInSection(pathname, link.href);
          const children = link.children ?? [];
          const hasChildren = children.length > 0;
          const isExpanded = !!expandedMenus[link.name];
          const submenuId = `${submenuIdBase}-${link.name.replace(/\s+/g, "-").toLowerCase()}`;

          if (!hasChildren) {
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-[#C9A227] text-[#1B2027] shadow-sm shadow-[#C9A227]/20"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] transition-transform ${
                    isActive ? "scale-110" : "group-hover:scale-110"
                  }`}
                />
                <span className="flex-1">{link.name}</span>
                {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
              </Link>
            );
          }

          return (
            <div key={link.name}>
              <div
                className={`group flex items-center rounded-lg transition-all duration-150 ${
                  isActive
                    ? "bg-[#C9A227] text-[#1B2027] shadow-sm shadow-[#C9A227]/20"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-transform ${
                      isActive ? "scale-110" : "group-hover:scale-110"
                    }`}
                  />
                  <span className="flex-1 truncate">{link.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => toggleMenu(link.name)}
                  aria-expanded={isExpanded}
                  aria-controls={submenuId}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${link.name} menu`}
                  className={`mr-1.5 rounded-md p-1.5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                    isActive ? "hover:bg-[#1B2027]/10" : "hover:bg-white/10"
                  }`}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {isExpanded && (
                <div id={submenuId} className="mt-0.5 space-y-0.5 pl-4">
                  {children.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={`flex items-center gap-2 rounded-lg border-l-2 py-2 pl-3 pr-2 text-[13px] font-medium transition-all duration-150 ${
                          childActive
                            ? "border-[#C9A227] bg-white/10 text-[#C9A227]"
                            : "border-transparent text-gray-400 hover:border-white/25 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-1 w-1 shrink-0 rounded-full bg-current opacity-70"
                        />
                        <span className="flex-1 truncate">{child.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Admin profile + back link */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#C9A227]/20 text-sm font-bold text-[#C9A227]">
            {profilePic ? (
              <img src={profilePic} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{adminName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{adminName}</p>
            <p className="text-xs text-gray-400">{roleLabel}</p>
          </div>
        </div>
        <Link
          href="/"
          onClick={onNavigate}
          className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut size={14} />
          Back to Store
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;
