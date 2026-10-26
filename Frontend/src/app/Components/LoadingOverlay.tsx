"use client";

import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";

/**
 * Global page-transition loader (shown on every client-side route change via
 * the Redux `ui.loading` flag set by ClientLayout).
 *
 * On-brand light loader: a gold ring spinner + Irhas'Inn wordmark on a soft
 * frosted-white backdrop, so the loader users see on navigation matches the
 * site's bright, premium surfaces (the thin nprogress top bar alone was too
 * subtle to register as a redesign).
 *
 * Kept pointer-events-none so the page underneath stays interactive, and
 * z-[100] so the brand-colored nprogress top bar (z-index 1031) still sits
 * above it during the transition.
 */
const LoadingOverlay = () => {
  const { loading, loadingMessage } = useSelector(
    (state: RootState) => state.ui,
  );

  if (!loading) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface/60 backdrop-blur-[3px] transition-opacity duration-300"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center rounded-2xl border border-brand-gold/20 bg-surface/95 px-9 py-7 text-center shadow-[0_20px_60px_rgba(34,40,49,0.12)]">
        {/* Brand ring spinner */}
        <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-brand-gold/15" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#C8A84E] border-r-[#E8C86E]" />
          <span className="absolute inset-[10px] rounded-full bg-brand-gold/10" />
        </div>

        <h3 className="text-lg font-black tracking-tight text-brand-navy">
          Irhas&apos;<span className="text-brand-gold">Inn</span>
        </h3>
        {/* Route changes set the brand wordmark as the message — skip the
            redundant duplicate and show real page-specific messages only. */}
        {loadingMessage && loadingMessage !== "Irhas'Inn" && (
          <p className="mt-1 text-xs font-semibold text-brand-navy/55">
            {loadingMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;
