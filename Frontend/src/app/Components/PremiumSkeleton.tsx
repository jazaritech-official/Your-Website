"use client";

import { motion } from "framer-motion";

/**
 * Premium skeleton loader with shimmer animation.
 * Matches the brand's visual language — uses brand colors and consistent spacing.
 */

const roundedMap: Record<string, string> = {
  none: "",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

type Rounded = keyof typeof roundedMap;

interface SkeletonProps {
  className?: string;
  rounded?: Rounded;
}

export function Skeleton({
  className = "",
  rounded = "lg",
}: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-100 ${roundedMap[rounded]} ${className}`}
    >
      <motion.div
        className="absolute inset-0 -translate-x-full"
        animate={{ translateX: ["-100%", "100%"] }}
        transition={{
          repeat: Infinity,
          duration: 1.5,
          ease: "easeInOut",
        }}
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(200,168,78,0.06) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

// ── Pre-built skeleton layouts ──

export function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden">
      <Skeleton className="aspect-square w-full" rounded="none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-8" rounded="full" />
        </div>
      </div>
    </div>
  );
}

export function OrderRowSkeleton() {
  return (
    <tr className="border-b border-slate-100 animate-pulse">
      <td className="p-4"><Skeleton className="h-3 w-10" /></td>
      <td className="p-4"><Skeleton className="h-3 w-32" /></td>
      <td className="p-4"><Skeleton className="h-3 w-24" /></td>
      <td className="p-4"><Skeleton className="h-3 w-20" /></td>
      <td className="p-4"><Skeleton className="h-6 w-28" rounded="full" /></td>
      <td className="p-4"><Skeleton className="h-6 w-28" rounded="full" /></td>
      <td className="p-4"><Skeleton className="h-3 w-20" /></td>
      <td className="p-4"><Skeleton className="h-8 w-24" rounded="lg" /></td>
    </tr>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <OrderRowSkeleton key={i} />
      ))}
    </>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
        <Skeleton className="h-11 w-11" rounded="xl" />
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
