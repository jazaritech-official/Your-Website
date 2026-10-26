"use client";

import React from "react";
import { type LucideIcon } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
 * StatCard — KPI stat card for admin dashboard
 *
 * The ONLY shared component the Admin panel renders, so it deliberately
 * avoids the storefront's dynamic theme tokens (--color-ink-muted,
 * --color-surface, --color-state-success, …) and uses the Admin panel's own
 * fixed palette instead. An Admin re-branding the storefront can therefore
 * never make the dashboard's KPI labels or cards unreadable.
 * ═══════════════════════════════════════════════════════════════ */

export interface StatCardProps {
  label: string;
  value: string;
  changePercent?: string | null; // e.g. "+12.5%" or null if no data
  icon: LucideIcon;
  iconBg?: string; // bg class for icon container
  iconColor?: string; // text class for icon
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  changePercent,
  icon: Icon,
  iconBg = "bg-gray-50",
  iconColor = "text-slate-500",
}) => {
  const isPositive = changePercent?.startsWith("+");
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {label}
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-[#111827]">
            {value}
          </h3>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
      {changePercent !== null && changePercent !== undefined && (
        <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
          <span
            className={`text-sm font-bold ${isPositive ? "text-emerald-600" : "text-red-600"}`}
          >
            {changePercent}
          </span>
          <span className="text-[11px] text-slate-400">vs last month</span>
        </div>
      )}
    </div>
  );
};
