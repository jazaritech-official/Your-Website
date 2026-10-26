"use client";

import React from "react";
import clsx from "clsx";

/* ═══════════════════════════════════════════════════════════════
 * Badge — unified pill for status / meta / count labels.
 *
 * Distinct from StatusBadge (which maps order status STRINGS to a
 * fixed palette). Badge is the generic building block for anything
 * that is not an order/payment status, so storefront surfaces stop
 * hard-coding one-off pill classes.
 * ═══════════════════════════════════════════════════════════════ */

export type BadgeTone =
  | "neutral"
  | "gold"
  | "navy"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type BadgeSize = "sm" | "md";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-ink-muted ring-line",
  gold: "bg-brand-gold/12 text-brand-gold-hover ring-brand-gold/30",
  navy: "bg-brand-navy text-white ring-brand-navy",
  success: "bg-state-success/12 text-state-success ring-state-success/25",
  warning: "bg-state-warning/12 text-state-warning ring-state-warning/25",
  danger: "bg-state-danger/10 text-state-danger ring-state-danger/25",
  info: "bg-state-info/10 text-state-info ring-state-info/25",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[10px] tracking-wide",
  md: "px-2.5 py-1 text-xs",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Renders a small dot before the label (status-style pill). */
  dot?: boolean;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  tone = "neutral",
  size = "md",
  dot = false,
  icon,
  className = "",
  children,
  ...rest
}) => (
  <span
    className={clsx(
      "inline-flex items-center gap-1.5 rounded-full font-semibold uppercase ring-1 ring-inset",
      TONES[tone],
      SIZES[size],
      className,
    )}
    {...rest}
  >
    {dot && (
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80"
      />
    )}
    {icon}
    {children}
  </span>
);

Badge.displayName = "Badge";
