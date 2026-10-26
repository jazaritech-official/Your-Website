"use client";

import type { NavbarProps } from "./types";

/* ─── iOS Install Instructions Modal ─── Identical in every design variant. */
export default function IosInstallModal({
  logoUrl,
  siteName,
  dismissIOSInstructions,
}: Pick<NavbarProps, "logoUrl" | "siteName" | "dismissIOSInstructions">) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${siteName} app`}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="w-full max-w-sm rounded-t-2xl bg-surface p-6 shadow-xl sm:rounded-xl animate-slide-up">
        <div className="text-center mb-5">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-navy">
            <img
              src={logoUrl}
              alt={siteName}
              className="h-10 w-10 rounded-xl object-cover"
            />
          </div>
          <h3 className="text-lg font-bold text-brand-navy">
            Install {siteName}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Add to your home screen for the best experience
          </p>
        </div>

        <ol className="space-y-3 mb-5">
          <li className="flex items-center gap-3 rounded-xl bg-surface-muted/30 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-white">1</span>
            <span className="text-xs font-medium text-gray-700">
              Tap the <strong>Share</strong> button in Safari
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-xl bg-surface-muted/30 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-white">2</span>
            <span className="text-xs font-medium text-gray-700">
              Scroll down and tap <strong>"Add to Home Screen"</strong>
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-xl bg-surface-muted/30 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-white">3</span>
            <span className="text-xs font-medium text-gray-700">
              Tap <strong>"Add"</strong> in the top-right corner
            </span>
          </li>
        </ol>

        <button
          onClick={dismissIOSInstructions}
          className="w-full rounded-lg bg-brand-gold py-3 text-sm font-bold text-white hover:bg-brand-gold-hover transition-colors duration-200"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
