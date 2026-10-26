"use client";

import { useState, useEffect, useCallback } from "react";
import { WifiOff, Wifi, Loader2 } from "lucide-react";

const OfflineBanner = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [mounted, setMounted] = useState(false);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      await fetch("/favicon.ico", { method: "HEAD", cache: "no-cache" });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline && mounted) {
      checkConnection();
    }
  }, [isOnline, mounted, checkConnection]);

  if (isOnline || !mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-brand-navy bg-[radial-gradient(ellipse_at_center,_rgba(200,168,78,0.08)_0%,_transparent_70%)] transition-opacity duration-500 ease-out"
      role="alert"
      aria-live="polite"
    >
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .pulse-ring {
          animation: pulse-ring 2s ease-out infinite;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in { animation: none; opacity: 1; transform: none; }
          .pulse-ring { animation: none; }
          .spin { animation: none; }
        }
      `}</style>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute w-32 h-32 rounded-full bg-brand-gold/10 blur-3xl pulse-ring" />
        <div className="absolute w-24 h-24 rounded-full bg-brand-gold/5 blur-3xl pulse-ring" style={{ animationDelay: "0.5s" }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 animate-fade-in">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-brand-gold/10 flex items-center justify-center">
            <WifiOff size={48} className="text-brand-gold" strokeWidth={1.5} />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-brand-gold/20" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
            No Internet Connection
          </h1>
          <p className="text-white/70 text-base sm:text-lg max-w-md leading-relaxed">
            Please check your network and try again. We'll automatically reconnect when you're back online.
          </p>
        </div>

        <button
          onClick={checkConnection}
          disabled={isChecking}
          className="group flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3 text-base font-bold text-white transition-all duration-300 hover:bg-brand-gold-hover hover:shadow-lg hover:shadow-brand-gold/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isChecking ? (
            <>
              <Loader2 size={18} className="spin" strokeWidth={2.5} />
              <span>Checking Connection...</span>
            </>
          ) : (
            <>
              <Wifi size={18} strokeWidth={2.5} />
              <span>Retry Connection</span>
            </>
          )}
        </button>

        <p className="text-white/30 text-xs uppercase tracking-wider">
          Your data is safe — changes will sync when reconnected
        </p>
      </div>
    </div>
  );
};

export default OfflineBanner;