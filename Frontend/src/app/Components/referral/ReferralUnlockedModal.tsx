"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, MessageCircle, X } from "lucide-react";
import {
  buildWhatsAppShareUrl,
  copyText,
} from "../../utils/referral";
import { showToast } from "../../utils/commonFunctions";

interface Props {
  open: boolean;
  code: string;
  onClose: () => void;
}

/**
 * Premium "You unlocked your referral code" popup. Shown only once per user
 * (acknowledgement is persisted in localStorage via onClose).
 */
const ReferralUnlockedModal = ({ open, code, onClose }: Props) => {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      // Small delay so the mount animation reads clearly
      const t = window.setTimeout(() => setVisible(true), 30);
      return () => window.clearTimeout(t);
    }
    setVisible(false);
  }, [open]);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      showToast("Referral code copied!", "success", "light");
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      showToast("Could not copy code", "error");
    }
  }, [code]);

  const handleClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Referral code unlocked"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-brand-navy/70 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl bg-surface shadow-2xl shadow-black/30 transition-all duration-300 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-95 opacity-0"
        }`}
      >
        {/* Navy → Gold header */}
        <div className="relative bg-gradient-to-br from-[#222831] via-[#222831] to-brand-gold px-8 pb-10 pt-9 text-center">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface/10 text-white/80 transition hover:bg-surface/20 hover:text-white"
          >
            <X size={16} />
          </button>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface/10 ring-1 ring-white/25">
            <Gift className="h-8 w-8 text-brand-gold" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Congratulations!
          </h2>
          <p className="mt-2 text-sm font-semibold text-white/80">
            You unlocked your Exclusive Referral Code
          </p>
        </div>

        <div className="h-1.5 bg-gradient-to-r from-brand-gold via-[#222831] to-brand-gold" />

        <div className="px-8 pb-8 pt-6">
          <p className="text-center text-sm leading-relaxed text-brand-navy">
            Share this code with your friends. Whenever an eligible customer
            places an order using it,{" "}
            <span className="font-bold text-brand-gold">you earn Referral Rewards</span>.
          </p>

          {/* Code + copy */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand-gold/60 bg-brand-gold/5 p-3">
            <code className="flex-1 text-center font-mono text-xl font-black tracking-[0.18em] text-brand-navy">
              {code}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-xl bg-brand-gold px-3.5 py-2.5 text-xs font-bold text-white transition-all hover:bg-brand-gold-hover active:scale-95"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* WhatsApp share */}
          <a
            href={buildWhatsAppShareUrl(code)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#25D366]/25 transition-all hover:brightness-105 hover:shadow-xl active:scale-[0.98]"
          >
            <MessageCircle size={16} />
            Share on WhatsApp
          </a>

          <button
            type="button"
            onClick={handleClose}
            className="mt-4 w-full rounded-2xl border border-line py-3 text-sm font-bold text-brand-navy transition hover:bg-surface-muted"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferralUnlockedModal;
