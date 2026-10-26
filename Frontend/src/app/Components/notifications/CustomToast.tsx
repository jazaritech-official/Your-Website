"use client";

import { FC, ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
} from "lucide-react";

export type NotificationType = "success" | "error" | "info" | "warn";

interface CustomToastProps {
  type?: NotificationType;
  message: ReactNode;
  duration?: number;
  onClose?: () => void;
  toastId?: string;
}

/* ── Type Design System ────────────────────────────────────────
   4 premium light modes aligned with the Irhas'Inn brand palette.
   Clean white card + type-coded icon chip + brand accent border.
   ────────────────────────────────────────────────────────────── */
const typeConfig = {
  success: {
    icon: CheckCircle2,
    accentBorder: "border-l-[3px] border-l-[#C8A84E] border-t border-r border-b border-t-emerald-100 border-r-emerald-100 border-b-emerald-100",
    iconBg: "bg-brand-gold/10",
    iconColor: "text-brand-gold",
    progressColor: "stroke-[#C8A84E]",
    title: "Success",
  },
  error: {
    icon: XCircle,
    accentBorder: "border-l-[3px] border-l-[#DC2626] border-t border-r border-b border-t-red-100 border-r-red-100 border-b-red-100",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
    progressColor: "stroke-red-400",
    title: "Error",
  },
  warn: {
    icon: AlertTriangle,
    accentBorder: "border-l-[3px] border-l-[#D97706] border-t border-r border-b border-t-amber-100 border-r-amber-100 border-b-amber-100",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    progressColor: "stroke-amber-400",
    title: "Warning",
  },
  info: {
    icon: Info,
    accentBorder: "border-l-[3px] border-l-[#222831] border-t border-r border-b border-t-slate-100 border-r-slate-100 border-b-slate-100",
    iconBg: "bg-slate-100",
    iconColor: "text-brand-navy",
    progressColor: "stroke-[#222831]/40",
    title: "Info",
  },
};

/* ────────────────────────────────────────────────────────────────
   Premium Full-Screen Overlay — Irhas'Inn Branded
   • Full-viewport fixed overlay with light backdrop + blur
   • Centered compact white card with type-coded left accent
   • Icon in a soft tinted chip
   • Navy title + neutral message
   • Circular SVG progress ring (depletes over ~1 second)
   • Enter: fade-in + slide-up (200ms, CSS)
   • Exit: fade-out + scale-down (150ms, CSS)
   ──────────────────────────────────────────────────────────────── */
const CustomToast: FC<CustomToastProps> = ({
  type = "info",
  message,
  duration = 1000,
  onClose,
  toastId: _toastId,
}) => {
  const config = typeConfig[type];
  const Icon = config.icon;
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const exitTimer = setTimeout(() => setIsExiting(true), duration);
    const dismissTimer = setTimeout(() => onClose?.(), duration + 200);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [duration, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`irhasinn-overlay-wrapper ${isExiting ? "irhasinn-overlay-exiting" : ""}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Backdrop */}
      <div className="irhasinn-overlay-backdrop" />

      {/* Center Card */}
      <div className="irhasinn-overlay-card-container">
        <div
          className={`
            relative overflow-hidden rounded-xl bg-surface
            ${config.accentBorder}
            shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]
            px-5 py-4 sm:px-6 sm:py-5
            min-w-[260px] max-w-[360px] sm:min-w-[300px]
          `}
        >
          <div className="flex items-start gap-3.5">
            {/* Icon chip */}
            <div
              className={`
                flex h-10 w-10 shrink-0 items-center justify-center
                rounded-full ${config.iconBg} ${config.iconColor}
              `}
            >
              <Icon size={20} strokeWidth={2.2} />
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-sm font-bold text-brand-navy leading-tight">
                {config.title}
              </h3>
              <p className="mt-1 text-[13px] font-medium text-brand-navy/60 leading-snug line-clamp-2">
                {message}
              </p>
            </div>
          </div>

          {/* Progress bar (thin, bottom) */}
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-brand-navy/5">
            <div
              className={`h-full rounded-full ${config.progressColor.replace("stroke-", "bg-")} irhasinn-overlay-progress-bar`}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CustomToast;
