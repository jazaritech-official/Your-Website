"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Smoothly scrolls to the element matching `window.location.hash` when the
 * pathname changes (e.g. navigating from another page with a `#section` hash).
 *
 * Extracted from the homepage page.tsx so that page can be a Server Component
 * while this browser-only scroll logic lives in a tiny Client Component island.
 */
export default function HashScrollHandler() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash) {
        setTimeout(() => {
          const el = document.getElementById(hash.replace("#", ""));
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }, 300);
      }
    }
  }, [pathname]);

  return null;
}
