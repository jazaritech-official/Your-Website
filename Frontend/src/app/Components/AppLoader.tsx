"use client";

import { useState, useEffect, useRef } from "react";
import { useBranding } from "./ThemeProvider";

const AppLoader = () => {
  // Admin-configured logo / site name (server-provided).
  const { logoUrl, siteName } = useBranding();
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const hasShown = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduceMotion(mediaQuery.matches);
      const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
      mediaQuery.addEventListener?.("change", handler);
      return () => mediaQuery.removeEventListener?.("change", handler);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const alreadyShown = sessionStorage.getItem("irhasinn_loader_shown");
        if (alreadyShown) {
          setVisible(false);
          hasShown.current = true;
          return;
        }
      } catch (err) { console.error("[silent-catch AppLoader.tsx]", err); }
    }

    const hideLoader = () => {
      if (hasShown.current) return;
      hasShown.current = true;

      try {
        sessionStorage.setItem("irhasinn_loader_shown", "true");
      } catch (err) { console.error("[silent-catch AppLoader.tsx]", err); }

      setFadeOut(true);

      setTimeout(() => {
        setVisible(false);
      }, 500);
    };

    const minTimer = setTimeout(() => {
      if (document.readyState === "complete") {
        hideLoader();
      } else {
        window.addEventListener("load", hideLoader, { once: true });
        setTimeout(hideLoader, 2500);
      }
    }, 800);

    return () => {
      clearTimeout(minTimer);
    };
  }, []);

  if (!visible) return null;

  const baseStyles = `
    fixed inset-0 z-[9999] flex flex-col items-center justify-center
    transition-opacity duration-700 ease-out
    ${fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"}
  `;

  const containerStyles = reduceMotion
    ? baseStyles.replace("duration-700 ease-out", "duration-300 ease-out")
    : baseStyles;

  return (
    <div className={containerStyles}>
      <style jsx>{`
        @keyframes logoEntrance {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes taglineEntrance {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes progressSweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes fadeOutScale {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(0.98);
          }
        }
        .logo-entrance {
          animation: logoEntrance 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        .tagline-entrance {
          animation: taglineEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
          opacity: 0;
        }
        .progress-bar {
          position: relative;
          width: 180px;
          height: 3px;
          border-radius: 9999px;
          background: rgba(200, 168, 78, 0.18);
          overflow: hidden;
        }
        .progress-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: linear-gradient(90deg, #C8A84E, #E8C86E, #C8A84E);
          background-size: 200% 100%;
          animation: progressSweep 1.4s ease-in-out infinite;
        }
        .fade-out-scale {
          animation: fadeOutScale 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-entrance,
          .tagline-entrance {
            animation: none;
            opacity: 1;
          }
          .progress-bar::after {
            animation: none;
          }
          .fade-out-scale {
            animation: none;
          }
        }
      `}</style>

      {/* Light backdrop with a barely-there warm tint — bright, clean and
          consistent with the site's white surfaces. */}
      <div className="absolute inset-0 bg-surface bg-[radial-gradient(ellipse_at_center,_rgba(200,168,78,0.07)_0%,_transparent_72%)]" />

      <div className="relative z-10 flex flex-col items-center gap-5 sm:gap-6">
        <div className="relative flex flex-col items-center">
          <div
            className={`logo-entrance ${fadeOut ? "fade-out-scale" : ""}`}
          >
            <div className="overflow-hidden rounded-2xl border border-brand-gold/25 bg-surface shadow-[0_18px_45px_rgba(34,40,49,0.10)]">
              <img
                src={logoUrl}
                alt={siteName}
                className="h-[4.5rem] w-[10rem] object-cover sm:h-[5.5rem] sm:w-[12rem]"
              />
            </div>
          </div>

          <div className="tagline-entrance text-center mt-5">
            <h1 className="text-2xl sm:text-3xl font-black text-brand-navy tracking-tight">
              Irhas&apos;<span className="text-brand-gold">Inn</span>
            </h1>
            <p className="mt-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.25em] text-brand-navy/45">
              Customize Product All In One
            </p>
          </div>

          <div className="mt-6 w-[180px] progress-bar" role="progressbar" aria-label="Loading" />
          <p className="mt-3 text-[11px] font-medium text-brand-navy/40">
            Preparing your experience…
          </p>
        </div>
      </div>

      <p className="absolute bottom-8 text-[9px] font-medium tracking-wider uppercase text-brand-navy/30">
        Premium Quality — Delivered with Care
      </p>
    </div>
  );
};

export default AppLoader;
