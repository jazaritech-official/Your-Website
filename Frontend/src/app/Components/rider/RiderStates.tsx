"use client";

import { motion } from "framer-motion";
import {
  PackageCheck,
  Clock,
  MapPin,
  Truck,
  CheckCircle2,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/app/Components/PremiumSkeleton";

/* ============================================================
   RIDER STATES — Empty, Loading, Error, Offline states
   
   Premium polished states that match the rider dashboard
   visual language. Every state provides useful information
   and a clear next action where possible.
   ============================================================ */

// ── Empty States ──

export function EmptyJobs() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center"
    >
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <PackageCheck size={28} className="text-[#0856DF]" />
        </div>
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#C8A84E]/20"
        />
      </div>
      <h3 className="mt-5 text-sm font-bold text-slate-700">
        No delivery jobs available
      </h3>
      <p className="mt-1.5 max-w-[280px] text-xs text-slate-400 leading-relaxed">
        New delivery jobs will appear here automatically when orders are ready for pickup.
      </p>
    </motion.div>
  );
}

export function EmptyDeliveries({ tab }: { tab: string }) {
  const config: Record<string, { icon: typeof Clock; color: string; label: string }> = {
    pending: {
      icon: Clock,
      color: "bg-blue-50 text-blue-500",
      label: "No pending deliveries",
    },
    outForDelivery: {
      icon: Truck,
      color: "bg-indigo-50 text-indigo-500",
      label: "No active deliveries",
    },
    reached: {
      icon: MapPin,
      color: "bg-purple-50 text-purple-500",
      label: "No arrived deliveries",
    },
    delivered: {
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-500",
      label: "No completed deliveries yet",
    },
  };
  const c = config[tab] || config.pending;
  const Icon = c.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center"
    >
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${c.color}`}>
        <Icon size={24} />
      </div>
      <h3 className="mt-5 text-sm font-bold text-slate-700">{c.label}</h3>
      <p className="mt-1.5 max-w-[260px] text-xs text-slate-400 leading-relaxed">
        {tab === "delivered"
          ? "Completed deliveries will show up here after you finish them."
          : "New assignments will appear here automatically."}
      </p>
    </motion.div>
  );
}

// ── Loading States ──

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" rounded="lg" />
          <Skeleton className="h-4 w-32" rounded="md" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-24" rounded="xl" />
          <Skeleton className="h-9 w-36" rounded="xl" />
        </div>
      </div>

      {/* Status cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <Skeleton className="h-8 w-12" rounded="lg" />
            <Skeleton className="mt-2 h-3 w-20" rounded="md" />
          </div>
        ))}
      </div>

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-full max-w-md" rounded="xl" />

      {/* Job cards skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-14 w-14 flex-shrink-0" rounded="xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" rounded="md" />
                <Skeleton className="h-3 w-1/3" rounded="md" />
                <div className="flex gap-2 mt-2">
                  <Skeleton className="h-6 w-20" rounded="lg" />
                  <Skeleton className="h-6 w-16" rounded="lg" />
                </div>
              </div>
              <Skeleton className="h-7 w-20" rounded="lg" />
            </div>
            <Skeleton className="mt-3 h-10 w-full" rounded="xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeliveryCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Skeleton className="h-1 w-full" rounded="none" />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11" rounded="xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" rounded="md" />
              <Skeleton className="h-3 w-24" rounded="md" />
            </div>
          </div>
          <Skeleton className="h-6 w-24" rounded="full" />
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-8 w-24" rounded="xl" />
          <Skeleton className="h-8 w-20" rounded="xl" />
          <Skeleton className="h-8 w-20" rounded="xl" />
        </div>
      </div>
    </div>
  );
}

// ── Offline / Error ──

export function OfflineBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <WifiOff size={16} className="flex-shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="text-xs font-bold text-amber-800">Connection lost</p>
        <p className="text-[11px] text-amber-600">
          Real-time updates paused. Trying to reconnect…
        </p>
      </div>
      <RefreshCw size={14} className="animate-spin text-amber-500" />
    </motion.div>
  );
}
