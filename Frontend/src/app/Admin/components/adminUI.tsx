// Shared Admin UI primitives — presentational only.
// No business logic, data fetching, or state lives here.
import React from "react";

const BRAND = "#0856DF";

export const adminCx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

/* ---------------------------------- Card ---------------------------------- */
export const AdminCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={adminCx(
      "bg-white rounded-2xl border border-slate-200 shadow-sm",
      className,
    )}
  >
    {children}
  </div>
);

/* --------------------------------- Button -------------------------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md";
  children: React.ReactNode;
};

export const AdminButton: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}) => {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-xs px-3 py-2",
    md: "text-sm px-4 py-2.5",
  };
  const variants = {
    primary:
      "bg-[#0856DF] text-white hover:bg-[#0645c8] focus:ring-[#0856DF]/40 shadow-sm",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-300",
    success:
      "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500/40 shadow-sm",
    danger:
      "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/40 shadow-sm",
    ghost:
      "bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-300",
  };
  return (
    <button
      className={adminCx(base, sizes[size], variants[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
};

/* --------------------------------- Badge --------------------------------- */
type BadgeTone =
  | "emerald"
  | "red"
  | "amber"
  | "blue"
  | "slate"
  | "violet";

export const AdminBadge: React.FC<{
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = "slate", children, className }) => {
  const tones: Record<BadgeTone, string> = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
    blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
    violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
    slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  };
  return (
    <span
      className={adminCx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
};

/* ------------------------------- PageHeader ------------------------------ */
export const AdminPageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, actions, className }) => (
  <div
    className={adminCx(
      "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
      className,
    )}
  >
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </div>
);

/* --------------------------------- Input --------------------------------- */
export const AdminInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={adminCx(
      "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15",
      className,
    )}
    {...rest}
  />
));
AdminInput.displayName = "AdminInput";

export const AdminTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={adminCx(
      "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15 resize-none",
      className,
    )}
    {...rest}
  />
));
AdminTextarea.displayName = "AdminTextarea";

export const AdminSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...rest }, ref) => (
  <select
    ref={ref}
    className={adminCx(
      "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15 appearance-none cursor-pointer",
      className,
    )}
    {...rest}
  />
));
AdminSelect.displayName = "AdminSelect";

export const AdminLabel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <label
    className={adminCx(
      "block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5",
      className,
    )}
  >
    {children}
  </label>
);

/* ------------------------------ Modal shell ------------------------------ */
export const AdminModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ open, onClose, title, children, maxWidth = "max-w-lg" }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={adminCx(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl",
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

/* ------------------------------ Table shell ----------------------------- */
export const AdminTableWrap: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={adminCx(
      "overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm",
      className,
    )}
  >
    <table className="w-full min-w-[640px] text-left">{children}</table>
  </div>
);

export const AdminTh: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <th
    className={adminCx(
      "whitespace-nowrap px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
      className,
    )}
  >
    {children}
  </th>
);

export const AdminTd: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <td className={adminCx("px-4 py-3.5 text-sm text-slate-700", className)}>
    {children}
  </td>
);

export const BRAND_COLOR = BRAND;

/* --------------------------- EmptyState / loading ------------------------ */
export const AdminEmpty: React.FC<{
  message: string;
  className?: string;
}> = ({ message, className }) => (
  <div
    className={adminCx(
      "flex flex-col items-center justify-center gap-2 px-4 py-16 text-center",
      className,
    )}
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    </div>
    <p className="text-sm font-semibold text-slate-500">{message}</p>
  </div>
);

export const AdminLoading: React.FC<{ message?: string }> = ({
  message = "Loading…",
}) => (
  <div className="flex items-center justify-center gap-3 px-4 py-16 text-slate-400">
    <svg
      className="h-5 w-5 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    <span className="text-sm font-medium">{message}</span>
  </div>
);
