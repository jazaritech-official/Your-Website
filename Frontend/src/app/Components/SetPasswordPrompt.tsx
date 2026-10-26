"use client";

import { useState, FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/app/Redux/store";
import { markPasswordSet } from "@/app/Redux/Features/authSlice";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import axios from "axios";
import { Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_STANDARD } from "@/app/utils/motion";

/**
 * Persistent, non-blocking prompt for Google-auth users who haven't set a
 * password yet. Appears on the Profile page until the user sets one.
 *
 * PRESENTATION ONLY — no business logic changes.
 */
export default function SetPasswordPrompt() {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  // Render only while the account genuinely has no password. This is the real
  // Redux state (never an optimistic local guess), so the prompt's exit
  // animation below is driven purely by the server-confirmed flag flipping.
  const shouldShow = Boolean(auth.username) && !auth.hasPassword;

  const validate = () => {
    const e: typeof errors = {};
    if (!password || password.length < 6) {
      e.password = "Password must be at least 6 characters";
    }
    if (password !== confirm) {
      e.confirm = "Passwords do not match";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await axios.post(
        `${baseUrl}auth/set-password`,
        { password },
        { withCredentials: true },
      );

      // Flip ONLY the hasPassword flag so the prompt disappears immediately.
      // Do NOT re-dispatch the whole user object: that previously persisted a
      // stale `role` back into localStorage and hid the Admin Dashboard entry.
      dispatch(markPasswordSet());

      showToast(res.data?.message || "Password set successfully!", "success");
      setPassword("");
      setConfirm("");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to set password", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {shouldShow && (
    <motion.div
      key="set-password-prompt"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: EASE_STANDARD }}
      className="rounded-card border border-warning/30 bg-warning/[0.04] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gold/15">
          <ShieldCheck size={20} className="text-brand-gold" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-brand-navy">
            Secure Your Account
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            You signed in with Google. Set a password so you can also log in
            with your email and password in the future.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {/* New password */}
            <div>
              <label htmlFor="set-pw" className="sr-only">
                New password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  aria-hidden
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                />
                <input
                  id="set-pw"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="New password (min 6 characters)"
                  autoComplete="new-password"
                  className={`w-full rounded-field border bg-surface py-2.5 pl-9 pr-10 text-sm text-ink outline-none transition-colors focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 ${
                    errors.password ? "border-state-danger" : "border-line"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-state-danger">{errors.password}</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="set-pw-confirm" className="sr-only">
                Confirm password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  aria-hidden
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                />
                <input
                  id="set-pw-confirm"
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
                  }}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  className={`w-full rounded-field border bg-surface py-2.5 pl-9 pr-4 text-sm text-ink outline-none transition-colors focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 ${
                    errors.confirm ? "border-state-danger" : "border-line"
                  }`}
                />
              </div>
              {errors.confirm && (
                <p className="mt-1 text-xs text-state-danger">{errors.confirm}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="inline-flex items-center gap-2 rounded-field bg-brand-navy px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-navy-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Setting...
                </>
              ) : (
                "Set Password"
              )}
            </button>
          </form>
        </div>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
