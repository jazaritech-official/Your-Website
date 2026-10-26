"use client";

import React from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
 * Button — unified action atom for the customer storefront.
 *
 * PRESENTATION ONLY. It renders a plain <button> and forwards every
 * DOM prop, so existing onClick / type / disabled / form / aria
 * wiring is untouched. `buttonStyles()` is exported so <Link> and
 * <a> CTAs can share the exact same visual language without the
 * component becoming polymorphic.
 *
 * Motion contract: transform + shadow + color only (GPU friendly),
 * with active:scale for tap feedback. No layout properties animate.
 * ═══════════════════════════════════════════════════════════════ */

export type ButtonVariant =
  | "primary"
  | "gold"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/45 focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:translate-y-0 disabled:shadow-none " +
  "active:scale-[0.98]";

const VARIANTS: Record<ButtonVariant, string> = {
  /* Navy — the primary structural action of the storefront. */
  primary:
    "bg-brand-navy text-white shadow-sm hover:bg-brand-navy-soft hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(34,40,49,0.22)]",
  /* Gold — the brand accent action. Dark ink keeps AA contrast. */
  gold:
    "bg-brand-gold text-brand-navy-deep shadow-sm hover:bg-brand-gold-hover hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(200,168,78,0.3)]",
  outline:
    "border border-brand-gold/60 bg-white text-brand-navy hover:border-brand-gold hover:bg-brand-gold/10",
  ghost: "text-brand-navy hover:bg-brand-navy/[0.06]",
  danger:
    "bg-state-danger text-white shadow-sm hover:bg-state-danger/90 hover:-translate-y-px",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-[0.55rem]",
  md: "h-11 px-5 text-sm rounded-field",
  lg: "h-12 px-6 text-[15px] rounded-field",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class builder shared by <Button> and <Link>-based CTAs. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: ButtonStyleOptions = {}): string {
  return clsx(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and blocks interaction without changing layout. */
  loading?: boolean;
  /** Optional icon rendered before the label. */
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      icon,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  ),
);

Button.displayName = "Button";
