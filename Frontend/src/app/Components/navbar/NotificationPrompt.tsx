"use client";

import { Bell } from "lucide-react";
import type { NavbarProps } from "./types";

/* Notification permission banner shown above the navbar. Moved verbatim;
   the container decides whether it is visible. */
export default function NotificationPrompt({
  handleEnableNotifications,
  handleDismissNotifPrompt,
}: Pick<NavbarProps, "handleEnableNotifications" | "handleDismissNotifPrompt">) {
  return (
    <div className="bg-brand-gold border-b border-brand-gold-hover">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-sm">
            <Bell size={18} className="text-brand-gold" />
          </div>

          <div className="flex flex-col">
            <span className="text-sm font-bold text-brand-navy">
              Enable Notifications
            </span>
            <span className="text-xs text-brand-navy/80">
              Stay updated with your orders and important alerts.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEnableNotifications}
            className="rounded-lg bg-brand-navy px-5 py-2 text-xs font-bold text-white hover:bg-black transition-colors duration-200"
          >
            Enable Now
          </button>

          <button
            onClick={handleDismissNotifPrompt}
            className="rounded-lg border border-brand-navy/15 bg-surface/80 px-4 py-2 text-xs font-semibold text-brand-navy hover:bg-surface transition-colors duration-200"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
