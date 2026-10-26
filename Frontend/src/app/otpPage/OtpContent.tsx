"use client";

import React, { useState, useRef, useEffect } from "react";
import { Suspense } from "react";
import axios from "axios";
import { motion, useAnimationControls } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Button } from "../Components/ui";
import { baseUrl, markJustAuthenticated, showToast } from "../utils/commonFunctions";
import { useDispatch, useSelector } from "react-redux";
import { loginSuccess } from "../Redux/Features/authSlice";
import { AppDispatch, RootState } from "../Redux/store";
import { useRouter, useSearchParams } from "next/navigation";

/*
 * PascalCase so ESLint's react-hooks plugin recognises this as a component.
 * It was lowercase (`otpContent`), which made every hook call in the file
 * report react-hooks/rules-of-hooks. The default export is unchanged, so no
 * consumer is affected.
 */
const OtpContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dispatch = useDispatch<AppDispatch>();
  const data = useSelector((state: RootState) => state.auth);

  const identifier =
    searchParams.get("identifier") ??
    data.email ??
    (data.phoneNo ? String(data.phoneNo) : null);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [timer, setTimer] = useState(60);
  const [isResending, setIsResending] = useState(false);

  // Countdown
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  /*
   * MOTION ONLY — replays a brief "incorrect code" shake on the digit row
   * whenever a NEW error message appears. This effect observes `error` and
   * starts an animation; it never sets state, never re-fetches, and never
   * changes when or why the error is produced.
   */
  const otpRowControls = useAnimationControls();
  const lastError = useRef("");
  useEffect(() => {
    if (error && error !== lastError.current) {
      otpRowControls.start({ x: [0, -7, 7, -4, 4, 0] });
    }
    lastError.current = error;
  }, [error, otpRowControls]);

  const handleChange = (value: string, index: number) => {
    if (!/^\d?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();

    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    const newOtp = ["", "", "", "", "", ""];

    pasted.split("").forEach((digit, index) => {
      newOtp[index] = digit;
    });

    setOtp(newOtp);

    const focusIndex = pasted.length >= 6 ? 5 : pasted.length;

    inputRefs.current[focusIndex]?.focus();
  };

  // VERIFY OTP
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setSuccess("");
    setIsLoading(true);

    const finalOtp = otp.join("");

    if (!identifier) {
      setError("Identifier not found");
      setIsLoading(false);
      return;
    }

    if (finalOtp.length !== 6) {
      setError("Please enter the complete 6-digit code");
      setIsLoading(false);
      return;
    }

    try {
      const { data: responseData } = await axios.post(
        `${baseUrl}auth/verifyOtp`,
        {
          identifier,
          otp: finalOtp,
        },
        {
          withCredentials: true,
        },
      );

      dispatch(
        loginSuccess({
          _id: responseData?.data?._id,
          username: responseData?.data?.username,
          profilePic: responseData?.data?.profilePic,
          phoneNo: responseData?.data?.phoneNo?.toString?.() ?? "",
          email: responseData?.data?.email,
          isVerified: responseData?.data?.isVerified,
          isAdmin: responseData?.data?.isAdmin ?? false,
          // Previously omitted, which made the reducer fall back to
          // "user" and strip admin access from the navbar dropdown.
          role: responseData?.data?.role,
        }),
      );

      // Open the post-auth cookie-commit grace window so the Navbar fetches
      // and Socket.IO handshake that fire next are not rejected with a 401.
      markJustAuthenticated();

      setSuccess("OTP Verified Successfully");

      showToast("OTP Verified Successfully", "success", "light");
      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Invalid OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0 || isResending) return;

    if (!identifier) {
      setError("Identifier not found");
      return;
    }

    setError("");
    setSuccess("");
    setIsResending(true);

    try {
      const { data } = await axios.post(`${baseUrl}auth/resendOtp`, {
        identifier,
      });
      setSuccess(data?.message || "OTP Resent Successfully!");

      setOtp(["", "", "", "", "", ""]);
      setTimer(60);

      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to resend OTP");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-page px-4 py-8">
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-brand-navy/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 25, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative w-full max-w-md rounded-sheet border border-line bg-surface p-6 shadow-sheet sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-label="OTP verification"
      >
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-card bg-brand-navy/10">
            <ShieldCheck size={34} aria-hidden className="text-brand-navy" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy sm:text-3xl">
            Verify OTP
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Enter the 6-digit verification code sent to your account.
          </p>
        </div>

        {/* Identifier */}
        <div className="mt-6 rounded-card border border-line bg-surface-muted p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
            Code sent to
          </p>

          <p className="mt-1 truncate text-sm font-bold text-brand-navy sm:text-base">
            {identifier}
          </p>
        </div>

        {/* OTP INPUTS */}
        <form onSubmit={handleSubmit} className="mt-7 space-y-6">
          <motion.div
            animate={otpRowControls}
            className="flex justify-center gap-2 sm:gap-3"
            onPaste={handlePaste}
          >
            {otp.map((digit, i) => (
              <motion.input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                value={digit}
                maxLength={1}
                inputMode="numeric"
                onChange={(e) => handleChange(e.target.value, i)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                aria-label={`Digit ${i + 1} of 6`}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "otp-error" : undefined}
                /* Subtle emphasis while a digit is present — replays as each
                   box is filled or cleared. Transform only. */
                animate={{ scale: digit ? 1.04 : 1 }}
                transition={{ duration: 0.12, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="h-14 w-12 rounded-field border-2 border-line bg-surface text-center text-xl font-bold text-brand-navy outline-none transition-[border-color,box-shadow] hover:border-ink-subtle focus:border-brand-gold focus:ring-4 focus:ring-brand-gold/15 sm:h-16 sm:w-14 sm:text-2xl sm:rounded-card"
              />
            ))}
          </motion.div>

          <Button type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
            {isLoading ? "Verifying..." : "Verify OTP"}
          </Button>
        </form>

        {/* TIMER / RESEND */}
        <div className="mt-6 text-center">
          {timer > 0 ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-muted px-4 py-2">
              <span className="text-sm text-ink-muted">
                Resend available in
              </span>

              <span className="text-sm font-bold text-brand-navy">
                {timer}s
              </span>
            </div>
          ) : (
            <button
              onClick={handleResendOtp}
              disabled={isResending}
              className="inline-flex items-center justify-center rounded-field px-5 py-2.5 text-sm font-bold text-brand-navy bg-brand-navy/[0.06] transition-colors hover:bg-brand-navy/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-navy/30 border-t-brand-navy" />
                  Sending...
                </span>
              ) : (
                "Resend OTP"
              )}
            </button>
          )}
        </div>

        {/* ERROR */}
        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            id="otp-error"
            className="mt-5 rounded-field border border-state-danger/25 bg-state-danger/[0.06] px-4 py-3"
          >
            <p className="text-center text-sm font-medium text-state-danger">
              {error}
            </p>
          </motion.div>
        )}

        {/* SUCCESS */}
        {success && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 rounded-field border border-state-success/25 bg-state-success/[0.06] px-4 py-3"
          >
            <p className="text-center text-sm font-medium text-state-success">
              {success}
            </p>
          </motion.div>
        )}

        {/* Bottom Security Text */}
        <div className="mt-7 border-t border-line pt-5 text-center">
          <p className="text-xs text-ink-subtle">
            Your verification code is secure and private.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default OtpContent;