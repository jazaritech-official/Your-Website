"use client";

import { X, Eye, EyeOff, Mail, Lock, Loader2, Sparkles } from "lucide-react";
import { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import { closeLogin, closeSignup, openLogin } from "../Redux/Features/modalSlice";
import { RootState, AppDispatch } from "../Redux/store";
import { baseUrl, markJustAuthenticated, showToast } from "../utils/commonFunctions";
import axios from "axios";
import {
  loginFailure,
  loginRequest,
  loginSuccess,
} from "@/app/Redux/Features/authSlice";
import { useRouter, usePathname } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { AnimatePresence, motion } from "framer-motion";

const Login = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const loginOpen = useSelector((state: RootState) => state.modal.loginOpen);
  const { loading } = useSelector((state: RootState) => state.auth);
  const [showPassword, setShowPassword] = useState(false);
  const [profilePic, setProfilePic] = useState("");
  const togglePassword = () => setShowPassword((prev) => !prev);

  const [credentials, setCredentials] = useState({
    identifier: "",
    password: "",
  });

  /* ==========================================
     RESET STATE ON OPEN
  ========================================== */
  useEffect(() => {
    if (loginOpen) {
      setCredentials({
        identifier: "",
        password: "",
      });
    }
  }, [loginOpen]);

  /* ==========================================
     SESSION EXPIRED — auto-open login + notice
  ========================================== */
  // When the axios interceptor detects an expired/invalid session it
  // redirects to /?sessionExpired=true. Auto-open the login modal and show
  // a clear "please log in again" message instead of a generic error.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sessionExpired") === "true") {
      // Clean the URL so a refresh doesn't re-prompt the message.
      params.delete("sessionExpired");
      const qs = params.toString();
      const next = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      window.history.replaceState({}, "", next);
      dispatch(openLogin());
      showToast("Your session has expired, please log in again", "error");
    }
  }, [dispatch]);

  /* ==========================================
     GOOGLE LOGIN HANDLER
  ========================================== */
  const pathname = usePathname();

  const handleGoogleSignup = async (response: any) => {
    dispatch(loginRequest());

    try {
      const res = await axios.post(
        `${baseUrl}auth/google`,
        { credential: response.credential },
        { withCredentials: true },
      );

      const userData = res.data.data;
      dispatch(loginSuccess(userData));
      markJustAuthenticated();

      showToast("Google Login Successful!", "success");
      dispatch(closeLogin());

      // Riders land directly on their dashboard after Google login too
      if (userData?.role === "rider") {
        router.push("/rider");
        return;
      }

      // Case A: General entry — if user has no password, prompt them to set one.
      // Case B: Checkout flow — the modal closes and user stays on checkout (no
      // redirect needed; the checkout page re-renders with the now-authenticated
      // state).
      const isCheckout = pathname.startsWith("/checkout");
      if (userData.hasPassword === false && !isCheckout) {
        router.push("/profile");
      }
    } catch (err: any) {
      dispatch(
        loginFailure(err?.response?.data?.message || "Google Login Failed!"),
      );

      showToast("Google Login Failed!", "error");
    }
  };

  /* ==========================================
     INPUT CHANGE HANDLER
  ========================================== */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCredentials({ ...credentials, [e.target.id]: e.target.value });
  };

  /* ==========================================
     CLOSE MODAL CONSOLE
  ========================================== */
  const handleClose = () => {
    dispatch(closeLogin());
    setCredentials({
      identifier: "",
      password: "",
    });
  };

  /* ==========================================
     FORM SUBMIT HIERARCHY
  ========================================== */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { identifier, password } = credentials;

    if (!identifier || !password) {
      return showToast("Both Fields should be filled!", "error", "dark");
    }
    if (password.length < 6) {
      return showToast(
        "Password must be at least 6 characters!",
        "error",
        "dark",
      );
    }

    try {
      dispatch(loginRequest());
      const res = await axios.post(
        `${baseUrl}auth/login`,
        {
          identifier,
          password,
        },
        { withCredentials: true },
      );
      if (res?.data?.requiresVerification) {
        const otpSent = res?.data?.otpSent;

        if (!otpSent) {
          dispatch(
            loginFailure(
              "Failed to send verification OTP. Please try again later.",
            ),
          );
          showToast(
            "Failed to send OTP. Please try again later.",
            "error",
            "dark",
          );
          dispatch(closeLogin());
          return;
        }

        dispatch(
          loginFailure(
            "Account not verified! Please verify your account before logging in.",
          ),
        );
        showToast(
          "Account not verified! Please verify your account",
          "error",
          "dark",
        );
        dispatch(closeLogin());
        router.push(`/otpPage?identifier=${encodeURIComponent(identifier)}`);
        return;
      }

      showToast(res.data.message || "Login successful!", "success", "light");

      const role = res?.data?.data?.role ?? "user";

      dispatch(
        loginSuccess({
          _id: res?.data?.data?._id,
          username: res?.data?.data?.username,
          profilePic: res?.data?.data?.profilePic,
          email: res?.data?.data?.email,
          phoneNo: res?.data?.data?.phoneNo,
          isVerified: res?.data?.data?.isVerified,
          isAdmin: res?.data?.data?.isAdmin ?? false,
          role,
        }),
      );
      markJustAuthenticated();
      dispatch(closeLogin());

      // Riders land directly on their dashboard after login
      if (role === "rider") {
        router.push("/rider");
      }
    } catch (err: any) {
      console.log(err.message);
      dispatch(loginFailure(err?.response?.data?.message || "Login failed!"));
      showToast(
        err?.response?.data?.message || "Login failed!",
        "error",
        "dark",
      );
    }
  };

  return (
    <>
      {/* FULL PAGE VIEWPORT LOADER (Syncing with Redux State) */}
      {loginOpen && loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-navy/40 backdrop-blur-md transition-all duration-500">
          <div className="bg-surface/90 px-8 py-6 rounded-3xl shadow-2xl border border-line flex flex-col items-center max-w-xs text-center animate-scale-up">
            <div className="relative flex items-center justify-center mb-4">
              <div className="absolute w-12 h-12 border-2 border-line rounded-full"></div>
              <Loader2 className="w-12 h-12 text-brand-navy animate-spin relative z-10 stroke-[1.5]" />
            </div>
            <h3 className="text-brand-navy font-semibold tracking-tight text-lg">
              Irhas'Inn Verification
            </h3>
            <p className="text-brand-navy text-xs mt-1 leading-relaxed">
              Establishing secure tunnel to your profile...
            </p>
          </div>
        </div>
      )}

      {/* MODAL WRAPPER — framer enter/exit (replaces the old CSS-only ir-fade-in) */}
      <AnimatePresence>
        {loginOpen && (
          <motion.div
            key="login-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={handleClose}
          >
        {/* MAIN CONTAINER - Two column layout */}
        <div className="relative w-full max-w-[800px] bg-surface rounded-[28px] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.3)] border border-white/10 overflow-hidden flex ir-scale-in" onClick={(e) => e.stopPropagation()}>
          {/* LEFT: Banner Image (hidden on mobile) */}
          <div className="hidden md:block w-[45%] relative overflow-hidden bg-brand-navy">
            {/* Blurred Zoomed Background */}
            <div className="absolute inset-0 overflow-hidden">
              <img
                src="/Login Screen-01.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl"
              />

              {/* Background Dark Overlay */}
              <div className="absolute inset-0 bg-black/25" />

              {/* Soft Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
            </div>

            {/* Main Clear Image */}
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <img
                src="/Login Screen-01.jpg"
                alt="Welcome"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>

            {/* Content Overlay */}
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

            <div className="absolute bottom-0 left-0 right-0 z-30 p-6">
              <h3 className="text-white text-lg font-black leading-tight">
                Welcome to
              </h3>

              <p className="text-brand-gold text-xl font-black mt-1">
                Irhas'Inn
              </p>

              <p className="text-white/70 text-xs mt-2 leading-relaxed">
                Customize Product All In One — Enjoy Shopping
              </p>
            </div>
          </div>

          {/* RIGHT: Form */}
          <div className="w-full md:w-[55%] p-8 sm:p-9 overflow-y-auto">
            {/* CLOSE BUTTON */}
            <button
              onClick={handleClose}
              className="absolute right-5 top-5 p-2 text-brand-navy hover:text-brand-gold bg-surface hover:bg-surface-muted rounded-full transition-all duration-300"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* BRAND TITLE ARCHITECTURE */}
            <div className="text-center mb-8 mt-2">
              <div className="inline-flex items-center justify-center gap-2 bg-brand-gold text-white w-auto py-5 px-5 h-10 rounded-xl mb-3 shadow-md shadow-brand-gold/10">
                <Sparkles className="w-5 h-5 fill-white/10" />
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Login
                </h2>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">
                Welcome Back
              </h2>
              <p className="text-xs font-medium text-brand-navy mt-1.5 uppercase tracking-widest">
                Access Irhas'Inn
              </p>
            </div>

            {/* OAUTH INTEGRATION */}
            <div className="w-full flex justify-center mb-5 transform transition-all duration-300 hover:scale-[1.01]">
              <GoogleLogin onSuccess={handleGoogleSignup} />
            </div>

            {/* LUXURY ACCENT DIVIDER */}
            <div className="flex items-center gap-4 my-6">
              <div className="h-[1px] bg-surface flex-1"></div>
              <span className="text-brand-navy text-[10px] font-bold uppercase tracking-[0.2em] select-none">
                Or Secure Credentials
              </span>
              <div className="h-[1px] bg-surface flex-1"></div>
            </div>

            {/* LOGIN FORM */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-3.5">
                {/* EMAIL FIELD */}
                <Input
                  icon={<Mail className="w-4 h-4" />}
                  type="text"
                  id="identifier"
                  placeholder="Registered Email OR Phone Number"
                  value={credentials.identifier}
                  onChange={handleChange}
                />

                {/* PASSWORD FIELD */}
                <div className="relative group/pass">
                  <span className="absolute left-4 top-[15px] text-brand-navy group-focus-within/pass:text-brand-navy transition-colors duration-300">
                    <Lock className="w-4 h-4 stroke-[1.8]" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Enter your Password"
                    value={credentials.password}
                    onChange={handleChange}
                    className="w-full bg-surface hover:bg-surface-muted focus:bg-surface border border-line focus:border-[#00ADB5] transition-all duration-300 p-3.5 pl-11 pr-11 rounded-xl outline-none font-medium text-sm text-brand-navy placeholder-[#EEEEEE]/90 tracking-wide"
                  />
                  <button
                    type="button"
                    onClick={togglePassword}
                    className="absolute right-4 top-[15px] text-brand-navy hover:text-[#00ADB5] transition-colors duration-200"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 stroke-[1.8]" />
                    ) : (
                      <Eye className="w-4 h-4 stroke-[1.8]" />
                    )}
                  </button>
                </div>
              </div>

              {/* ACTION CONSOLES */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-1/3 bg-surface hover:bg-surface-muted text-brand-navy font-medium text-sm py-3.5 rounded-xl border border-line transition-all duration-300 transform active:scale-[0.99]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 bg-brand-gold hover:bg-brand-gold-hover text-white font-medium text-sm py-3.5 rounded-xl shadow-lg shadow-brand-gold/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 transform active:scale-[0.97] disabled:opacity-50 tracking-wide"
                >
                  Identity Verification
                </button>
              </div>
            </form>

            {/* FORMAL FOOTER NOTE */}
            <p className="text-center text-[11px] text-brand-navy mt-6 leading-relaxed px-4">
              Secured interface environment. System access subject to formal
              verification audit logs.
            </p>
          </div>
        </div>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Login;

/* ==========================================================================
   FORMAL HIGH-END STYLED INPUT SUB-COMPONENT
========================================================================== */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ReactNode;
}

const Input = ({ icon, ...props }: InputProps) => (
  <div className="relative group/input">
    <span className="absolute left-4 top-[15px] text-brand-navy group-focus-within/input:text-brand-navy transition-colors duration-300">
      {icon}
    </span>
    <input
      {...props}
      className="w-full bg-surface hover:bg-surface-muted focus:bg-surface border border-line focus:border-brand-gold transition-all duration-300 p-3.5 pl-11 rounded-xl outline-none font-medium text-sm text-brand-navy placeholder-[#EEEEEE]/90 tracking-wide"
    />
  </div>
);
