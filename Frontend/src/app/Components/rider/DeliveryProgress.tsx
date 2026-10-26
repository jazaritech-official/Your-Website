"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  progressStepVariants,
  progressLineVariants,
} from "./RiderAnimations";

/* ============================================================
   DELIVERY PROGRESS — Visual step-through of the delivery flow
   
   Renders a horizontal stepper that animates through:
   ASSIGNED → OUT FOR DELIVERY → REACHED → DELIVERED
   
   The backend statuses are: Shipped → Out for Delivery → 
   Reached Destination → Delivered
   ============================================================ */

interface Step {
  key: string;
  label: string;
  shortLabel: string;
}

const STEPS: Step[] = [
  { key: "Shipped", label: "Assigned", shortLabel: "Assigned" },
  { key: "Out for Delivery", label: "Out for Delivery", shortLabel: "Picking Up" },
  { key: "Reached Destination", label: "Arrived", shortLabel: "Arrived" },
  { key: "Delivered", label: "Delivered", shortLabel: "Delivered" },
];

function getStepIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

export default function DeliveryProgress({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const currentIdx = getStepIndex(status);
  const isDelivered = status === "Delivered";

  return (
    <div className={`flex items-center gap-0 ${className}`}>
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isLast = idx === STEPS.length - 1;

        return (
          <div key={step.key} className="flex flex-1 items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 relative z-10">
              <motion.div
                variants={progressStepVariants}
                animate={
                  isCompleted
                    ? "completed"
                    : isActive
                      ? "active"
                      : "inactive"
                }
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                  isCompleted
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-[#0856DF] text-white shadow-lg shadow-[#0856DF]/25"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {isCompleted ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </motion.div>
              <span
                className={`hidden text-[10px] font-semibold sm:block ${
                  isCompleted || isActive ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {step.shortLabel}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="mx-1.5 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-100 sm:mx-3">
                <motion.div
                  variants={progressLineVariants}
                  animate={
                    isCompleted
                      ? "completed"
                      : isActive
                        ? "active"
                        : "inactive"
                  }
                  className={`h-full origin-left ${
                    isCompleted
                      ? "bg-emerald-400"
                      : isActive
                        ? "bg-gradient-to-r from-[#0856DF] to-[#0856DF]/30"
                        : "bg-slate-100"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Compact mobile version ── */
export function DeliveryProgressCompact({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const currentIdx = getStepIndex(status);
  const total = STEPS.length;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        {STEPS.map((_, idx) => (
          <div
            key={idx}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              idx <= currentIdx ? "bg-[#0856DF]" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
        {currentIdx + 1}/{total}
      </span>
    </div>
  );
}
