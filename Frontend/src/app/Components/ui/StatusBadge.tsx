"use client";

import React from "react";

/* ═══════════════════════════════════════════════════════════════
 * StatusBadge — color-coded status pill
 * ═══════════════════════════════════════════════════════════════ */

const statusColorMap: Record<string, { bg: string; text: string; label: string }> = {
  // Order / tracking statuses
  pending:      { bg: "bg-gray-100",   text: "text-gray-700",    label: "Pending" },
  processing:   { bg: "bg-amber-100",  text: "text-amber-700",   label: "Processing" },
  packed:       { bg: "bg-sky-100",    text: "text-sky-700",     label: "Packed" },
  shipped:      { bg: "bg-blue-100",   text: "text-blue-700",    label: "Shipped" },
  "out for delivery": { bg: "bg-indigo-100", text: "text-indigo-700", label: "Out for Delivery" },
  "reached destination": { bg: "bg-purple-100", text: "text-purple-700", label: "Reached" },
  delivered:    { bg: "bg-emerald-100", text: "text-emerald-700", label: "Delivered" },
  cancelled:    { bg: "bg-red-100",    text: "text-red-600",     label: "Cancelled" },
  // Payment statuses
  paid:         { bg: "bg-emerald-100", text: "text-emerald-700", label: "Paid" },
  unpaid:       { bg: "bg-amber-100",  text: "text-amber-700",   label: "Unpaid" },
  // Review statuses
  approved:     { bg: "bg-emerald-100", text: "text-emerald-700", label: "Approved" },
  rejected:     { bg: "bg-red-100",    text: "text-red-600",     label: "Rejected" },
};

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = "" }) => {
  const key = status.toLowerCase();
  const colors = statusColorMap[key] || { bg: "bg-gray-100", text: "text-gray-700", label: status };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colors.bg} ${colors.text} ${className}`}
    >
      {colors.label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════
 * LogoLockup — branded logo with tagline
 * ═══════════════════════════════════════════════════════════════ */

export interface LogoLockupProps {
  className?: string;
  compact?: boolean;
}

export const LogoLockup: React.FC<LogoLockupProps> = ({ className = "", compact = false }) => (
  <div className={`inline-flex flex-col items-center ${className}`}>
    <div
      className={`flex items-center justify-center border border-[#C9A227]/40 bg-[#1B2027] ${
        compact ? "rounded-lg px-3 py-1.5" : "rounded-xl px-5 py-2.5"
      }`}
    >
      <span
        className={`font-black uppercase tracking-[0.15em] text-[#C9A227] ${
          compact ? "text-sm" : "text-xl"
        }`}
      >
        IRHAS&apos;INN
      </span>
    </div>
    {!compact && (
      <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.3em] text-ink-muted">
        Customize Product All In One
      </span>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
 * SectionLabel — gold eyebrow / section label
 * ═══════════════════════════════════════════════════════════════ */

export interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ children, className = "" }) => (
  <span
    className={`text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A227] ${className}`}
  >
    {children}
  </span>
);
