"use client";
import { formatPKR } from "@/app/utils/format";

import React from "react";
import { Check } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
 * StepIndicator — numbered step bar (e.g., checkout flow)
 * ═══════════════════════════════════════════════════════════════ */

export interface Step {
  label: string;
}

export interface StepIndicatorProps {
  steps: Step[];
  currentStep: number; // 0-indexed
  className?: string;
  /** Accessible name for the step group, e.g. "Checkout progress". */
  ariaLabel?: string;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  steps,
  currentStep,
  className = "",
  ariaLabel,
}) => (
  <div
    className={`flex items-center justify-center ${className}`}
    role="group"
    aria-label={ariaLabel}
  >
    {steps.map((step, idx) => {
      const isCompleted = idx < currentStep;
      const isCurrent = idx === currentStep;
      return (
        <React.Fragment key={step.label}>
          {idx > 0 && (
            <div
              aria-hidden="true"
              className={`mx-2 h-0.5 flex-1 max-w-16 sm:max-w-24 sm:mx-4 transition-colors duration-300 ${
                idx <= currentStep ? "bg-[#C9A227]" : "bg-surface-muted"
              }`}
            />
          )}
          <div
            className="flex flex-col items-center gap-1.5"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div
              className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all duration-300 ${
                isCompleted
                  ? "bg-state-success text-white shadow-md shadow-emerald-200"
                  : isCurrent
                  ? "bg-[#C9A227] text-[#1B2027] shadow-md shadow-amber-200"
                  : "bg-surface-muted text-ink-subtle border border-line"
              }`}
            >
              {isCompleted ? <Check size={16} strokeWidth={3} /> : idx + 1}
            </div>
            <span
              className={`text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                isCurrent ? "text-[#1B2027]" : isCompleted ? "text-state-success" : "text-ink-subtle"
              }`}
            >
              {step.label}
            </span>
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
 * PriceSummary — itemized price breakdown
 * ═══════════════════════════════════════════════════════════════ */

export interface PriceSummaryProps {
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  className?: string;
  showTotal?: boolean;
}

export const PriceSummary: React.FC<PriceSummaryProps> = ({
  subtotal,
  shipping,
  discount = 0,
  total,
  className = "",
  showTotal = true,
}) => (
  <div className={`space-y-2 ${className}`}>
    <div className="flex items-center justify-between text-sm text-ink-muted">
      <span>Subtotal</span>
      <span className="font-medium text-[#111827]">{formatPKR(subtotal)}</span>
    </div>
    <div className="flex items-center justify-between text-sm text-ink-muted">
      <span>Shipping</span>
      <span className="font-medium text-[#111827]">
        {shipping === 0 ? "Free" : `${formatPKR(shipping)}`}
      </span>
    </div>
    {discount > 0 && (
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">Discount</span>
        <span className="font-medium text-[#DC2626]">- {formatPKR(discount)}</span>
      </div>
    )}
    {showTotal && (
      <>
        <div className="border-t border-line pt-2 mt-2" />
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-[#111827]">Total</span>
          <span className="text-lg font-black text-[#C9A227]">{formatPKR(total)}</span>
        </div>
      </>
    )}
  </div>
);
