"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Bike, Home, LogOut } from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";
import axios from "axios";
import { baseUrl, clearAllFetchCache } from "../utils/commonFunctions";

/**
 * Rider layout — mobile-first, premium delivery dashboard shell.
 * Only accessible to users with role === "rider".
 */
export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useSelector((state: RootState) => state.auth);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = window.localStorage.getItem("user");
      let resolvedRole: string | null = null;
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          resolvedRole = parsedUser?.role ?? (parsedUser?.isAdmin ? "superadmin" : "user");
        } catch {
          resolvedRole = "user";
        }
      }
      setRole(resolvedRole);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!auth.username || role !== "rider") {
      router.replace("/");
    }
  }, [ready, role, auth.username, router]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem("user");
    } catch (err) { console.error("[silent-catch layout.tsx]", err); }
    try {
      await axios.post(`${baseUrl}auth/logout`, {}, { withCredentials: true });
    } catch (err) { console.error("[silent-catch layout.tsx]", err); }
    clearAllFetchCache();
    window.location.href = "/";
  };

  if (!ready || !auth.username || role !== "rider") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="text-center">
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#C8A84E]/20" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#C8A84E] to-[#B8943F] shadow-lg shadow-[#C8A84E]/20">
              <Bike size={20} className="text-white" />
            </div>
          </div>
          <p className="mt-4 text-sm font-bold text-slate-600">Loading Rider Hub…</p>
          <div className="mx-auto mt-3 h-1 w-24 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 animate-[loading_1.5s_ease-in-out_infinite] rounded-full bg-[#C8A84E]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#C8A84E] to-[#B8943F] shadow-sm shadow-[#C8A84E]/20 sm:h-9 sm:w-9 sm:rounded-xl">
              <Bike size={16} className="text-white sm:h-[17px] sm:w-[17px]" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold leading-tight text-slate-900">Rider Hub</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#C8A84E]">
                Irhas&apos;Inn Delivery
              </p>
            </div>
            <p className="text-sm font-bold text-slate-900 sm:hidden">Rider Hub</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {pathname !== "/rider" && (
              <Link
                href="/rider"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 sm:rounded-xl sm:px-3.5 sm:py-2"
              >
                <Home size={12} />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-black sm:rounded-xl sm:px-3.5 sm:py-2"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
