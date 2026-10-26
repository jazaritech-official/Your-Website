"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  /** Delay before animation starts (ms) — for staggering multiple siblings */
  delay?: number;
  /** Direction of slide: "up" (default), "down", "left", "right" */
  direction?: "up" | "down" | "left" | "right";
  /** Pixel offset for the slide distance */
  offset?: number;
  /** Additional CSS classes */
  className?: string;
}

const DIRECTION_MAP = {
  up: { x: 0, y: 24 },
  down: { x: 0, y: -24 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
};

/**
 * Fades + slides children into view once when they scroll into the viewport.
 * Uses a single IntersectionObserver per instance — no timers, no polling.
 * Respects prefers-reduced-motion (instant reveal).
 */
export default function ScrollReveal({
  children,
  delay = 0,
  direction = "up",
  offset = 24,
  className = "",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  // Check reduced-motion preference once
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dir = DIRECTION_MAP[direction];

  // Reduced motion: instant reveal, no animation
  if (prefersReduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? "translate(0, 0)"
          : `translate(${dir.x}px, ${dir.y}px)`,
        transition: `opacity 0.4s ease-out ${delay}ms, transform 0.4s ease-out ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
