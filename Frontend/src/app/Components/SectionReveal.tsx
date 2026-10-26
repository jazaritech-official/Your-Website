"use client";

import { useEffect, useRef, useState } from "react";
import ScrollReveal from "./ScrollReveal";

interface SectionRevealProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  className?: string;
  /**
   * F-009: when true, children are only mounted once the wrapper element
   * enters the viewport (with a generous rootMargin so fetching starts
   * slightly before the section scrolls into view). This prevents below-fold
   * sections from firing their useFetch calls immediately on page mount,
   * cutting the initial homepage waterfall.
   */
  lazy?: boolean;
}

/**
 * Thin client wrapper so Server Components (like page.tsx) can wrap
 * sections with scroll-triggered reveal animations.
 */
export default function SectionReveal({
  children,
  delay = 0,
  direction = "up",
  className = "",
  lazy = false,
}: SectionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref}>
      {visible ? (
        <ScrollReveal delay={delay} direction={direction} className={className}>
          {children}
        </ScrollReveal>
      ) : null}
    </div>
  );
}
