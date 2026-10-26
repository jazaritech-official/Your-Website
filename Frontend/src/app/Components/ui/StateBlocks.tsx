"use client";

import React from "react";
import clsx from "clsx";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

/* ═══════════════════════════════════════════════════════════════
 * EmptyState — on-brand zero-data surface.
 *
 * Every empty state in the storefront must answer the same two
 * questions: what is missing, and what do I do next. The action is
 * therefore a required slot (a Link or a Button).
 * ═══════════════════════════════════════════════════════════════ */

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Tighter padding for use inside cards / drawers. */
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
  className = "",
}) => (
  <div
    className={clsx(
      "flex flex-col items-center justify-center rounded-card border border-line bg-surface text-center",
      compact ? "px-6 py-10" : "px-6 py-16 sm:py-20",
      className,
    )}
  >
    <div
      aria-hidden
      className={clsx(
        "relative mb-5 flex items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold",
        compact ? "h-14 w-14" : "h-16 w-16",
      )}
    >
      {icon}
    </div>
    <h2 className="text-lg font-bold tracking-tight text-brand-navy sm:text-xl">
      {title}
    </h2>
    {description && (
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        {description}
      </p>
    )}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
 * ErrorState — actionable failure surface.
 *
 * Preserves the real failure message (no error suppression) while
 * making it readable and re-triggerable. User-entered data is never
 * touched here — callers keep their own state.
 * ═══════════════════════════════════════════════════════════════ */

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className = "",
}) => (
  <div
    role="alert"
    className={clsx(
      "flex flex-col items-center justify-center rounded-card border border-state-danger/25 bg-state-danger/[0.04] px-6 py-12 text-center",
      className,
    )}
  >
    <div
      aria-hidden
      className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-state-danger/10 text-state-danger"
    >
      <AlertTriangle size={26} />
    </div>
    <h2 className="text-lg font-bold tracking-tight text-brand-navy">{title}</h2>
    {message && (
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{message}</p>
    )}
    {onRetry && (
      <div className="mt-6">
        <Button variant="primary" size="md" icon={<RefreshCw size={15} />} onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    )}
  </div>
);
