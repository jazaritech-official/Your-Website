"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useRef, useState } from "react";
import { Truck, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { getShippingSettings, type ShippingSettings } from "../utils/shipping";

/**
 * Free Shipping Progress Bar — shared by the Cart and Checkout pages.
 *
 * Decision logic (evaluated fresh on every render, so live cart changes —
 * quantity updates / adds / removes — re-evaluate instantly with no refresh):
 *
 *  1. Admin settings (threshold + master toggle) are fetched ONCE on mount
 *     from the public GET /settings endpoint. Until they arrive (or if the
 *     request fails) the bar renders NOTHING — fail-safe.
 *  2. If the admin has toggled the feature OFF → render nothing, on any
 *     page, for any cart.
 *  3. If the cart already qualifies for free shipping via the per-product
 *     `freeShipping` flag (any item is free-shipping-flagged — per the
 *     client's described rule, that alone makes the order free-shipping),
 *     the "add more to unlock" messaging would be wrong/confusing → render
 *     nothing.
 *  4. Otherwise show the threshold progress: subtotal < threshold → progress
 *     bar + "Add Rs X more to unlock free shipping"; subtotal >= threshold →
 *     success state.
 *
 * Celebration: when the state genuinely transitions locked → unlocked, a
 * small, tasteful confetti burst + a very short, low-volume Web Audio
 * "hurray" tone play exactly once. No celebration on mount, on re-renders
 * while already unlocked, or when prefers-reduced-motion is enabled.
 *
 * NOTE: This component is display-only. The actual order shipping charge is
 * computed server-side in orderController.createOrder (out of scope here).
 */
interface FreeShippingProgressBarProps {
  /** Cart items — used to detect per-product free-shipping eligibility. */
  items: Array<{ freeShipping?: boolean }>;
  /** Current order subtotal (Rs). */
  subtotal: number;
}

const FreeShippingProgressBar = ({
  items,
  subtotal,
}: FreeShippingProgressBarProps) => {
  const [settings, setSettings] = useState<ShippingSettings | null>(null);

  // Tracks the last seen unlocked state so the celebration fires ONLY on the
  // locked → unlocked transition (never on mount or while already unlocked).
  const prevUnlocked = useRef<boolean | null>(null);
  // Browsers block audio until a user interaction has occurred — track one so
  // the tone is only ever attempted inside a user-driven flow.
  const hasInteracted = useRef(false);

  // Shared settings fetch (module-cached in utils/shipping.ts — same object
  // the Cart/Checkout totals use, so the bar and the shipping cost can never
  // disagree). Fail-safe: if settings are unreachable the bar stays hidden.
  useEffect(() => {
    let cancelled = false;
    getShippingSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark that the user has interacted (click / keypress) so audio can play.
  useEffect(() => {
    const mark = () => {
      hasInteracted.current = true;
    };
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  // Same eligibility math used below, computed early so the celebration hook
  // can live above the early returns (hooks must run unconditionally).
  const thresholdForCheck = settings
    ? Math.max(0, Number(settings.freeShippingThreshold) || 0)
    : 0;
  const isUnlocked =
    !!settings &&
    settings.freeShippingProgressBarEnabled &&
    !items.some((item) => item.freeShipping) &&
    thresholdForCheck > 0 &&
    subtotal >= thresholdForCheck;

  // Celebrate the actual unlock event — exactly once per transition.
  useEffect(() => {
    if (prevUnlocked.current === null) {
      // First evaluation — set the baseline, never celebrate a mount.
      prevUnlocked.current = isUnlocked;
      return;
    }
    const didUnlock = isUnlocked && !prevUnlocked.current;
    prevUnlocked.current = isUnlocked;
    if (!didUnlock) return;

    // Respect reduced motion — the unlocked text alone communicates the state.
    const reducedMotion =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    // Small, tasteful burst in brand colors — short and light.
    confetti({
      particleCount: 60,
      spread: 70,
      startVelocity: 32,
      gravity: 0.9,
      scalar: 0.9,
      ticks: 120,
      origin: { y: 0.6 },
      zIndex: 9999,
      colors: ["#C8A84E", "#B8943F", "#222831", "#FFFFFF"],
    });

    playHurray();
  }, [isUnlocked]);

  /**
   * Plays a very short, low-volume celebratory tone (C5–E5–G5–C6 arpeggio)
   * generated with the Web Audio API — no audio asset required. Gated behind
   * a prior user interaction (browser autoplay policy) and never throws: if
   * audio is blocked it simply does nothing and the confetti carries the
   * celebration.
   */
  const playHurray = () => {
    if (!hasInteracted.current || typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.07, now + 0.02); // low volume
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
      master.connect(ctx.destination);

      // C5 → E5 → G5 → C6, 90ms apart — a quick, friendly "hurray".
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(master);
        const t = now + i * 0.09;
        osc.start(t);
        osc.stop(t + 0.25);
      });

      // Release the context shortly after the tone finishes.
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 1200);
    } catch {
      /* audio blocked or unavailable — never break the UI */
    }
  };

  // 1. Settings not loaded yet (or unreachable) → render nothing.
  if (!settings) return null;

  // 2. Feature toggled OFF by the admin → never render.
  if (!settings.freeShippingProgressBarEnabled) return null;

  // 3. Order already ships free via a per-product free-shipping flag →
  //    the threshold progress messaging must not show.
  if (items.some((item) => item.freeShipping)) return null;

  const threshold = Math.max(0, Number(settings.freeShippingThreshold) || 0);
  if (threshold <= 0) return null; // nothing to unlock

  const remaining = Math.max(0, threshold - subtotal);
  const percent = Math.min(100, Math.max(0, Math.round((subtotal / threshold) * 100)));

  // 4a. Threshold reached → success state.
  if (remaining <= 0) {
    return (
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-4">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={20} className="shrink-0 text-brand-gold-hover" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-navy">
              Free shipping unlocked!
            </p>
            <p className="text-xs text-brand-navy/70">
              Your order qualifies for free delivery.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4b. Below threshold → progress bar + how-much-more messaging.
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <Truck size={20} className="shrink-0 text-brand-gold" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-brand-navy">
            Add {formatPKR(remaining)} more to unlock free shipping
          </p>
          <p className="text-xs text-brand-navy/70">
            Your subtotal is {formatPKR(Math.round(subtotal))} of Rs{" "}
            {threshold.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand-gold transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress towards free shipping"
        />
      </div>
    </div>
  );
};

export default FreeShippingProgressBar;
