"use client";

import React from "react";
import clsx from "clsx";

/* ═══════════════════════════════════════════════════════════════
 * Field / TextInput — unified form presentation layer.
 *
 * PRESENTATION ONLY. These wrap native controls and forward every
 * DOM prop (value, onChange, ref, name, id, autoComplete, aria-*),
 * so route handlers, validation schemas and payloads are unchanged.
 * Error text is bound through aria-describedby + aria-invalid.
 * ═══════════════════════════════════════════════════════════════ */

export interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className = "",
  children,
}) => (
  <div className={clsx("w-full", className)}>
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
    >
      {label}
      {required && (
        <span className="ml-0.5 text-state-danger" aria-hidden>
          *
        </span>
      )}
    </label>

    {children}

    {error ? (
      <p
        id={`${htmlFor}-error`}
        role="alert"
        className="mt-1.5 flex items-center gap-1 text-xs font-medium text-state-danger"
      >
        {error}
      </p>
    ) : hint ? (
      <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-ink-subtle">
        {hint}
      </p>
    ) : null}
  </div>
);

/** Shared control classes so inputs/selects/textareas stay identical. */
export function fieldStyles(opts: { invalid?: boolean; className?: string } = {}) {
  const { invalid = false, className = "" } = opts;
  return clsx(
    "w-full rounded-field border bg-white px-4 text-[15px] text-brand-navy outline-none",
    "transition-[border-color,box-shadow] duration-200 placeholder:text-ink-subtle",
    "focus:ring-4 focus:ring-brand-gold/15 focus:border-brand-gold",
    invalid
      ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
      : "border-line hover:border-line-soft",
    className,
  );
}

export interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  /** Renders the error styling and sets aria-invalid. */
  invalid?: boolean;
  /** Id of the rendered error/hint element so a11y stays wired. */
  describedById?: string;
  className?: string;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ invalid, describedById, className, ...rest }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      aria-describedby={describedById}
      className={fieldStyles({ invalid: Boolean(invalid), className: clsx("h-12", className) })}
      {...rest}
    />
  ),
);

TextInput.displayName = "TextInput";
