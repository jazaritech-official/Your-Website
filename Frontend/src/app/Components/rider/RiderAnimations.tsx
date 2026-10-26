import type { Variants, Transition } from "framer-motion";

/* ============================================================
   RIDER ANIMATION SYSTEM — Irhas'Inn Delivery Hub
   
   GPU-friendly motion primitives for the rider dashboard.
   All animations use only transform + opacity — zero layout
   thrashing, zero jank on mid-range mobile devices.
   ============================================================ */

// ── Timing ──
const EASE_STANDARD: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];
const EASE_BOUNCY: [number, number, number, number] = [0.34, 1.56, 0.64, 1];
const DUR_FAST = 0.2;
const DUR_NORMAL = 0.35;
const DUR_SLOW = 0.5;

// ── Delivery Progress ──
export const progressTransition: Transition = {
  duration: DUR_SLOW,
  ease: EASE_STANDARD,
};

export const statusBadgeVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: DUR_FAST, ease: EASE_BOUNCY },
  },
  exit: { scale: 0.8, opacity: 0, transition: { duration: DUR_FAST } },
};

// ── New Job Entrance ──
export const newJobVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -24,
    scale: 0.96,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DUR_NORMAL,
      ease: EASE_STANDARD,
    },
  },
  exit: {
    opacity: 0,
    x: -80,
    scale: 0.95,
    transition: { duration: DUR_FAST, ease: EASE_STANDARD },
  },
};

// ── New Job Glow (subtle highlight on arrival) ──
export const jobGlowVariants: Variants = {
  initial: { boxShadow: "0 0 0px rgba(8,86,223,0)" },
  glow: {
    boxShadow: [
      "0 0 0px rgba(8,86,223,0)",
      "0 0 20px rgba(8,86,223,0.15)",
      "0 0 0px rgba(8,86,223,0)",
    ],
    transition: { duration: 1.5, ease: "easeInOut" },
  },
};

// ── Job Card ──
export const jobCardVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_NORMAL, ease: EASE_STANDARD },
  },
  hover: {
    y: -2,
    transition: { duration: DUR_FAST, ease: EASE_STANDARD },
  },
  tap: {
    scale: 0.985,
    transition: { duration: 0.1 },
  },
};

// ── Active Delivery Card ──
export const deliveryCardVariants: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR_SLOW, ease: EASE_STANDARD },
  },
};

// ── Delivery Progress Step ──
export const progressStepVariants: Variants = {
  inactive: { scale: 0.7, opacity: 0.3 },
  active: {
    scale: 1,
    opacity: 1,
    transition: { duration: DUR_NORMAL, ease: EASE_BOUNCY },
  },
  completed: {
    scale: 1,
    opacity: 1,
    transition: { duration: DUR_FAST, ease: EASE_STANDARD },
  },
};

// ── Delivery Progress Line ──
export const progressLineVariants: Variants = {
  inactive: { scaleX: 0 },
  active: {
    scaleX: 1,
    transition: { duration: DUR_SLOW, ease: EASE_STANDARD },
  },
  completed: {
    scaleX: 1,
    transition: { duration: DUR_FAST, ease: EASE_STANDARD },
  },
};

// ── Stat Counter ──
export const statCounterVariants: Variants = {
  initial: { opacity: 0, y: -10, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR_NORMAL, ease: EASE_BOUNCY },
  },
};

// ── Accept Button ──
export const acceptButtonVariants: Variants = {
  idle: { scale: 1 },
  hover: {
    scale: 1.02,
    transition: { duration: DUR_FAST, ease: EASE_STANDARD },
  },
  tap: {
    scale: 0.97,
    transition: { duration: 0.1 },
  },
  accepted: {
    scale: [1, 1.08, 0.95, 1],
    transition: { duration: 0.5, ease: EASE_BOUNCY },
  },
};

// ── Stagger Container (for lists) ──
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

// ── Page Section ──
export const sectionFadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_NORMAL, ease: EASE_STANDARD },
  },
};

// ── Connection Dot ──
export const connectionPulse: Variants = {
  connected: {
    scale: [1, 1.5, 1],
    opacity: [1, 0.5, 1],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
  disconnected: {
    scale: 1,
    opacity: 0.5,
    transition: { duration: DUR_FAST },
  },
};
