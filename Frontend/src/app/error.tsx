"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * App Router error boundary for every route below the root layout.
 *
 * This is purely additive: it only renders when a route segment throws during
 * render/load. The normal (successful) render path is completely untouched.
 * Previously an uncaught render error produced a blank screen; now it shows a
 * recoverable fallback and logs the error for diagnosis.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // console.error is preserved in production builds (next.config.ts strips
    // only log/debug/info).
    console.error("[AppError]", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-surface-page px-6 py-16 text-center">
      <div className="max-w-md">
        <div aria-hidden className="mb-4 text-4xl">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-brand-navy">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          An unexpected error occurred while loading this page. Please try
          again.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-field bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-gold"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-field border border-line bg-surface px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-surface-muted"
          >
            Go Home
          </Link>
        </div>
      </div>
    </main>
  );
}
