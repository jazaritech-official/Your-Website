"use client";

import { FC, useEffect, useRef } from "react";
import { X } from "lucide-react";

export type NotificationModalType = "success" | "error" | "warning" | "info";

interface NotificationModalProps {
  open: boolean;
  type?: NotificationModalType;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const typeConfig = {
  success: {
    accent: "bg-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  error: {
    accent: "bg-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
  },
  warning: {
    accent: "bg-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  info: {
    accent: "bg-sky-500",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
  },
};

const NotificationModal: FC<NotificationModalProps> = ({
  open,
  type = "info",
  title,
  message,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  showCancel = true,
  onConfirm,
  onCancel,
  onClose,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel?.();
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    confirmButtonRef.current?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel, onClose]);

  if (!open) return null;

  const config = typeConfig[type];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onCancel || onClose}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-[0_25px_60px_rgba(0,0,0,0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-modal-title"
      >
        {/* Top accent */}
        <div className={`h-1.5 w-full ${config.accent}`} />

        <div className="p-6 sm:p-8">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>

          {/* Title */}
          <h3
            id="notification-modal-title"
            className="text-lg font-black text-brand-navy sm:text-xl"
          >
            {title}
          </h3>

          {/* Message */}
          {message && (
            <p className="mt-2 text-sm leading-relaxed text-brand-navy">{message}</p>
          )}

          {/* Actions */}
          <div className={`mt-6 flex gap-2 ${showCancel ? "justify-end" : "justify-end"}`}>
            {showCancel && (
              <button
                type="button"
                onClick={() => {
                  onCancel?.();
                  onClose?.();
                }}
                className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-brand-navy transition hover:bg-surface-muted"
              >
                {cancelLabel}
              </button>
            )}
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={() => {
                onConfirm?.();
                onClose?.();
              }}
              className="rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-gold-hover"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
