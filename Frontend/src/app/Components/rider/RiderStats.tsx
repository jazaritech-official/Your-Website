"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, sectionFadeUp, statCounterVariants } from "./RiderAnimations";

/* ============================================================
   RIDER STATS — Animated stat cards for the dashboard
   
   Shows counts for each delivery state with animated number
   transitions. Uses the brand's visual language.
   ============================================================ */

interface StatItem {
  key: string;
  label: string;
  count: number;
  icon: LucideIcon;
  color: string;
  iconColor: string;
  activeColor: string;
}

export default function RiderStats({
  stats,
  activeTab,
  onSelectTab,
}: {
  stats: StatItem[];
  activeTab: string;
  onSelectTab: (key: string) => void;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3"
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isActive = activeTab === stat.key;

        return (
          <motion.button
            key={stat.key}
            variants={sectionFadeUp}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelectTab(stat.key)}
            className={`relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all sm:p-4 ${
              isActive
                ? `border-[#0856DF] bg-[#0856DF]/5 ring-1 ring-[#0856DF]/20`
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  isActive ? "bg-[#0856DF]/10" : "bg-slate-100"
                }`}
              >
                <Icon
                  size={16}
                  className={isActive ? "text-[#0856DF]" : stat.iconColor}
                />
              </div>
              <motion.span
                variants={statCounterVariants}
                key={stat.count}
                initial="initial"
                animate="animate"
                className={`text-xl font-black tabular-nums ${
                  isActive ? "text-[#0856DF]" : "text-slate-900"
                }`}
              >
                {stat.count}
              </motion.span>
            </div>
            <p
              className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${
                isActive ? "text-[#0856DF]/70" : "text-slate-400"
              }`}
            >
              {stat.label}
            </p>

            {/* Active indicator dot */}
            {isActive && (
              <motion.div
                layoutId="stat-indicator"
                className="absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-[#0856DF]"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ── Tab bar (smaller, for secondary use) ──

export function TabBar({
  tabs,
  activeTab,
  onSelectTab,
}: {
  tabs: { key: string; label: string; count: number }[];
  activeTab: string;
  onSelectTab: (key: string) => void;
}) {
  return (
    <div className="flex max-w-full overflow-x-auto scrollbar-none rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onSelectTab(tab.key)}
          className={`relative whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === tab.key
              ? "bg-[#0856DF] text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span
              className={`ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                activeTab === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
