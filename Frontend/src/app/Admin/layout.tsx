"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./components/Sidebar";
import TopNav from "./components/TopNav";

// Admin status comes from the `role` field on the User document,
// which is auto-assigned based on SUPER_ADMIN_EMAIL / ADMIN_EMAILS
// env vars at signup / login (see authController.js for details).
// Routes only superadmin can access.
// Jazari Tech internal sales tooling — Showcase Studio and Pitch Records
// are restricted to the SAME superadmin tier on the backend too
// (requireSuperAdmin on /api/v1/brand-profiles/admin* and
// /api/v1/pitch-records/admin*), so UI guard and API guard agree (F-14).
const SUPERADMIN_ONLY_ROUTES = [
  "/Admin/Users",
  "/Admin/Categories",
  "/Admin/Carts",
  "/Admin/Settings",
  "/Admin/HomepageBanners",
  // Storefront-wide branding: superadmin-only, same tier as Settings.
  "/Admin/Appearance",
  // Jazari Tech internal sales tooling (white-label studio).
  "/Admin/ShowcaseStudio",
  "/Admin/PitchRecords",
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = window.localStorage.getItem("user");
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          const userRole = parsedUser?.role ?? (parsedUser?.isAdmin ? "superadmin" : "user");
          setRole(userRole);
        } catch {
          setRole("user");
        }
      } else {
        setRole("user");
      }
      setReady(true);
    }
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Route guard: redirect reseller admins away from superadmin-only pages
  useEffect(() => {
    if (!ready || !role || !pathname) return;
    if (role === "admin") {
      const blocked = SUPERADMIN_ONLY_ROUTES.some(
        (r) => pathname === r || pathname.startsWith(r + "/")
      );
      if (blocked) {
        router.replace("/Admin/Overview");
      }
    }
  }, [ready, role, pathname, router]);

  const getPageTitle = () => {
    if (!pathname) return "Overview";
    const pathSegments = pathname.split("/");
    const activeRoute = pathSegments[pathSegments.length - 1];
    if (!activeRoute || activeRoute.toLowerCase() === "admin") return "Overview";
    const map: Record<string, string> = {
      overview: "Dashboard",
      products: "Products",
      // Dedicated Add Product page (/Admin/Products/AddProduct)
      addproduct: "Add Product",
      categories: "Categories",
      homepagebanners: "Homepage Banners",
      homesections: "Home Sections",
      orders: "Orders",
      tracking: "Order Tracking",
      chats: "Chats",
      carts: "Carts",
      users: "Customers",
      onlineusers: "Online Users",
      analytics: "Analytics",
      referrals: "Referrals",
      appearance: "Website Appearance",
      settings: "Settings",
    };
    return map[activeRoute.toLowerCase()] || activeRoute.charAt(0).toUpperCase() + activeRoute.slice(1);
  };

  if (!ready) return null;

  const isAdmin = role === "superadmin" || role === "admin";

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Access Denied</h1>
          <p className="mt-2 text-sm text-[#6B7280]">Admin access is required to view this panel.</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-6 w-full rounded-lg bg-[#1B2027] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1B2027]/90"
          >
            Go to Store Home
          </button>
        </div>
      </div>
    );
  }

  // Show access denied for reseller trying to access superadmin-only route
  const isBlockedRoute =
    role === "admin" &&
    SUPERADMIN_ONLY_ROUTES.some(
      (r) => pathname === r || pathname.startsWith(r + "/")
    );

  if (isBlockedRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Access Denied</h1>
          <p className="mt-2 text-sm text-[#6B7280]">This section is restricted to Super Admins only.</p>
          <button
            onClick={() => router.replace("/Admin/Overview")}
            className="mt-6 w-full rounded-lg bg-[#1B2027] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1B2027]/90"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111827]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] shadow-xl">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="lg:pl-72 flex min-h-screen flex-col">
        <TopNav title={getPageTitle()} onMenuClick={() => setSidebarOpen(true)} />
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
