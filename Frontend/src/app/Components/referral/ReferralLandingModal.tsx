"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Gift, X } from "lucide-react";
import Link from "next/link";
import {
  REFERRAL_LANDING_SEEN_KEY,
  formatRs,
} from "../../utils/referral";

interface Props {
  open: boolean;
  minLifetimePurchase: number;
  lifetimeSpend: number;
  progress: number;
  onClose: () => void;
}

/**
 * "Spend Rs 9,999 lifetime" elegantly-marketed popup for users who do not yet
 * have referral access. Appears at most once per 7 days (localStorage), is
 * fully dismissible, and never interrupts the first page interaction.
 */
const ReferralLandingModal = ({
  open,
  minLifetimePurchase,
  lifetimeSpend,
  progress,
  onClose,
}: Props) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => setVisible(true), 40);
      return () => window.clearTimeout(t);
    }
    setVisible(false);
  }, [open]);

  const handleClose = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        REFERRAL_LANDING_SEEN_KEY,
        String(Date.now())
      );
    }
    window.setTimeout(onClose, 200);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Unlock referral rewards"
    >
      <div
        className={`absolute inset-0 bg-brand-navy/60 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-2xl shadow-black/30 transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <div className="relative px-7 pb-7 pt-9 text-center">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Dismiss"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-brand-navy/70 transition hover:bg-brand-gold/15 hover:text-brand-gold"
          >
            <X size={15} />
          </button>

          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#222831] to-brand-gold">
            <Gift className="h-7 w-7 text-white" />
          </div>

          <h3 className="text-xl font-black tracking-tight text-brand-navy">
            Spend {formatRs(minLifetimePurchase)} Lifetime
          </h3>
          <p className="mt-1.5 text-sm font-semibold text-brand-gold">
            Unlock your Exclusive Referral Rewards
          </p>
          <p className="mt-3 text-xs leading-relaxed text-brand-navy/70">
            Earn rewards every time a friend orders using your personal
            referral code. No strings attached — just shop and share.
          </p>

          {/* Progress toward the goal */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-brand-navy/60">
              <span>{formatRs(lifetimeSpend)} spent</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-gold to-[#222831] transition-all duration-700"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-brand-navy/60">
              {Math.max(0, minLifetimePurchase - lifetimeSpend) > 0
                ? `${formatRs(
                    Math.max(0, minLifetimePurchase - lifetimeSpend)
                  )} more to unlock`
                : "You're almost there!"}
            </p>
          </div>

          <Link
            href="/"
            onClick={handleClose}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-gold px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-gold/25 transition-all hover:bg-brand-gold-hover active:scale-[0.98]"
          >
            Continue Shopping <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="mt-3 w-full text-center text-[11px] font-semibold text-brand-navy/50 transition hover:text-brand-navy"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferralLandingModal;
