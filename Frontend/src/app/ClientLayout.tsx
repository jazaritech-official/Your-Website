"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MotionConfig } from "framer-motion";

import AppLoader from "./Components/AppLoader";
import { ErrorBoundary } from "./Components/ErrorBoundary";
import OfflineBanner from "./Components/OfflineBanner";
import Navbar from "./Components/Navbar";
import Footer from "./Components/Footer";
import Signup from "./Components/signup";
import Login from "./Components/login";
import CartDrawer from "./Components/CartDrawer";
import LoadingOverlay from "./Components/LoadingOverlay";
import OrderTrackingWidget from "./Components/OrderTrackingWidget";
import MobileBottomNav from "./Components/MobileBottomNav";
import PageTransition from "./Components/PageTransition";
import ReferralLandingGate from "./Components/referral/ReferralLandingGate";
import ShowcaseProvider from "./Components/showcase/ShowcaseProvider";
import { SocketProvider } from "./utils/PusherSocketProvider";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Components/notifications/notificationStyles.css";
import { RootState } from "./Redux/store";
import { startLoading, stopLoading } from "./Redux/Features/uiSlice";
import { hydrateFromServer } from "./Redux/Features/authSlice";
import { baseUrl } from "./utils/commonFunctions";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentPathRef = useRef<string | null>(null);
  const dispatch = useDispatch();
  const { loading } = useSelector((state: RootState) => state.ui);

  // PWA service worker: register once, then report readiness.
  // (next-pwa already enables `register: true`; the explicit register() call is
  // idempotent for the same scope, and the readiness check below must not
  // trigger a second registration attempt.)
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("🔴 PWA Service Worker failed to load/register:", err);
    });

    navigator.serviceWorker.ready
      .then((registration) => {
        console.log("🟢 PWA Service Worker is active & ready:", registration.scope);
      })
      .catch((err) => {
        console.error("🔴 PWA Service Worker failed to load/register:", err);
      });
  }, []);

  useEffect(() => {
    if (currentPathRef.current === null) {
      currentPathRef.current = pathname;
      return;
    }

    if (pathname !== currentPathRef.current) {
      dispatch(startLoading("Irhas'Inn"));
      currentPathRef.current = pathname;
    }
  }, [pathname, dispatch]);

  useEffect(() => {
    if (loading) {
      // Short-lived, non-blocking overlay: long enough to feel instant,
      // short enough to never block interaction (overlay is pointer-events-none).
      const timer = window.setTimeout(() => {
        dispatch(stopLoading());
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [loading, dispatch]);

  // Phase 1 of localStorage migration: session bootstrap from server.
  // On app load, if localStorage indicates a logged-in user, fetch the
  // server-truth user data via the httpOnly cookie and hydrate Redux.
  // This runs alongside (not instead of) localStorage hydration — the
  // existing localStorage-based state is used for instant UI paint,
  // and this call corrects it if the server state differs (e.g., role
  // was changed, session expired, etc.).
  useEffect(() => {
    const hasLocalUser = typeof window !== "undefined" && !!localStorage.getItem("user");
    if (!hasLocalUser) return;

    fetch(`${baseUrl}auth/me`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((json) => {
        const user = json?.data;
        if (user && user._id) {
          dispatch(hydrateFromServer(user));
        }
      })
      .catch((err) => {
        // Previously silent. The localStorage state remains the fallback, but
        // the failure is now visible in logs (console.error survives prod).
        console.error("[ClientLayout] auth/me hydration failed:", err);
      });
  }, [dispatch]);

  // Safely check if the current path should hide the storefront chrome
  // (Navbar / Footer / floating widget). Hidden for /otpPage, /Admin/* and
  // the dedicated /rider routes — the rider has its own minimal shell.
  const hideLayout =
    pathname === "/otpPage" ||
    (pathname &&
      (pathname.startsWith("/Admin") || pathname.startsWith("/rider")));

  return (
    <MotionConfig reducedMotion="user">
      {/* Active brand-showcase context (published configurations only).
          Applies the active showcase's theme overrides + branding on every
          route; no-op for regular visitors who never opened a showcase. */}
      <ShowcaseProvider>
      {/* Branded App Loader (first-load splash screen) */}
      <AppLoader />

      {/* Offline / No Internet Overlay */}
      <OfflineBanner />

      {/* Global Loading Overlay */}
      <LoadingOverlay />

      {/* ── Premium Full-Screen Notification Overlay Container ── */}
      {/*
          The full-screen overlay notification system.
          All visual design is delegated to CustomToast.tsx & notificationStyles.css.
          ToastContainer config is kept minimal — the overlay uses position: fixed
          so the container's position/transition props do not affect it.
      */}
      <ToastContainer
        position="top-center"
        autoClose={1400}
        hideProgressBar
        closeOnClick={false}
        pauseOnHover={false}
        pauseOnFocusLoss={false}
        draggable={false}
        closeButton={false}
        icon={false}
        theme="dark"
        limit={3}
        newestOnTop
        toastClassName=""
        style={undefined}
      />

      {/* Navbar - Rendered conditionally, hidden on Admin and OTP routes */}
      {!hideLayout && <Navbar />}

      {/* Main Page Content */}
      <main className="pb-mobile-nav md:pb-0">
        <SocketProvider>
          <PageTransition>
            {/* Catches client render errors below the segment boundary and
                shows a recoverable fallback instead of a blank area. No effect
                on the successful render path. */}
            <ErrorBoundary>{children}</ErrorBoundary>
          </PageTransition>
        </SocketProvider>
      </main>

      {/* Mobile Bottom Navigation — only visible on screens < md */}
      {!hideLayout && <MobileBottomNav />}

      {/* Global Auth Modals */}
      <Signup />
      <Login />

      {/* Quick-view cart drawer (presentation-only overlay) */}
      <CartDrawer />

      {/* Referral unlock teaser — homepage only, at most once per 7 days */}
      {!hideLayout && <ReferralLandingGate />}

      {/* Floating Order Tracking Widget - hidden only on the dedicated rider routes */}
      {!pathname?.startsWith("/rider") && <OrderTrackingWidget />}

      {/* Footer - Rendered conditionally, hidden on Admin and OTP routes */}
      {!hideLayout && <Footer />}
      </ShowcaseProvider>
    </MotionConfig>
  );
}
