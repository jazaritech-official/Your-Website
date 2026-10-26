"use client";

import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useRef } from "react";
import { pageEnter } from "../utils/motion";

/**
 * Lightweight page-transition wrapper.
 *
 * Uses AnimatePresence keyed on `pathname` so the outgoing page fades out
 * and the incoming page fades in. The animation is intentionally minimal
 * (opacity + tiny translateY — GPU properties only) and reads from the
 * centralized motion presets in utils/motion.ts. It complements the
 * existing LoadingOverlay without fighting it.
 *
 * The transition uses `mode="wait"` so the old page unmounts before the
 * new one mounts, preventing layout overlap. The old page fades out
 * quickly (0.25s) while the new page fades in slightly slower (0.4s).
 *
 * Accessibility: `useReducedMotion()` disables the transform AND duration
 * entirely for users who prefer reduced motion (the page just swaps), in
 * addition to the global <MotionConfig reducedMotion="user"> in ClientLayout.
 */

export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFirstRender = useRef(true);
  const prefersReducedMotion = useReducedMotion();

  // Skip animation on the very first render — only animate route changes.
  const shouldAnimate = isFirstRender.current === false;
  if (isFirstRender.current) isFirstRender.current = false;

  // Reduced motion: swap pages instantly with no transform animation.
  if (prefersReducedMotion) {
    return <div>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className="min-h-0"
        {...(shouldAnimate
          ? {
              variants: pageEnter,
              initial: "initial",
              animate: "animate",
              exit: "exit",
            }
          : { initial: false })}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}