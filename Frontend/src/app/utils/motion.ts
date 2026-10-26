import type { Variants } from "framer-motion";

/* ============================================================
   Centralized Motion Presets — Irhas'Inn storefront
   Single source of truth for framer-motion easings, durations,
   and shared variants so every component animates with the
   same feel. GPU-friendly properties ONLY: opacity + transform.
   ============================================================ */

/** Signature ease — soft deceleration used across the storefront. */
export const EASE_STANDARD: [number, number, number, number] = [
  0.21, 0.47, 0.32, 0.98,
];

/** Snappier ease for entrances that should feel crisp. */
export const EASE_OUT_QUINT: [number, number, number, number] = [
  0.16, 1, 0.3, 1,
];

/** Duration tiers (seconds). */
export const DUR_MICRO = 0.15; // buttons, icons, taps
export const DUR_COMPONENT = 0.3; // cards, thumbnails, overlays
export const DUR_PAGE = 0.4; // route transitions

/* ── Micro-interactions (buttons / taps) ─────────────────── */

export const buttonHover = {
  scale: 1.03,
  transition: { duration: DUR_MICRO, ease: EASE_STANDARD },
};

export const buttonTap = {
  scale: 0.97,
  transition: { duration: DUR_MICRO, ease: EASE_STANDARD },
};

/* ── Generic entrances ───────────────────────────────────── */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_COMPONENT, ease: EASE_STANDARD },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DUR_COMPONENT, ease: "easeOut" },
  },
};

/** Success "pop" for icons (cart, checks) — scale keyframes only. */
export const popOnce: Variants = {
  rest: { scale: 1 },
  pop: {
    scale: [1, 1.3, 0.92, 1],
    transition: { duration: 0.45, ease: EASE_STANDARD },
  },
};

/* ── Staggered grids (product cards) ─────────────────────── */

export const gridContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
};

export const gridItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_COMPONENT, ease: EASE_STANDARD },
  },
};

/* ── Page / route transitions ────────────────────────────── */

export const pageEnter: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_PAGE, ease: EASE_STANDARD },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.25, ease: EASE_STANDARD },
  },
};

/* ── Drawers / side panels ───────────────────────────────── */

export const drawerOverlay: Variants = {
  closed: { opacity: 0, transition: { duration: 0.2, ease: "easeOut" } },
  open: { opacity: 1, transition: { duration: 0.25, ease: "easeOut" } },
};

export const drawerPanel: Variants = {
  closed: {
    x: "100%",
    transition: { duration: 0.28, ease: EASE_STANDARD },
  },
  open: {
    x: 0,
    transition: { duration: 0.32, ease: EASE_OUT_QUINT },
  },
};

/* ── Exit-capable lists ───────────────────────────────────────
   For lists whose items can be removed (wishlist, notifications,
   cart lines). Transform + opacity ONLY — deliberately no
   height/margin animation, matching the technique already used by
   CartDrawer's motion.li so removal reflow stays composited.
   `layout` on the item handles sibling reflow; see wishlist. */
export const listContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_COMPONENT, ease: EASE_STANDARD },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

/* ── Capped per-item entrance for long, data-driven lists ─────
   Framer's `staggerChildren` keeps growing with the child count, so
   a 50-row order history would still be animating two seconds in.
   This helper caps the total stagger: item 8 and every item after it
   starts at the same time. Transform + opacity only, same duration
   and easing as every other entrance. */
export const LIST_STAGGER_STEP = 0.04;
export const LIST_STAGGER_CAP = 0.32;

export const listItemEnter = (index: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: DUR_COMPONENT,
    ease: EASE_STANDARD,
    delay: index > 0
      ? Math.min(index * LIST_STAGGER_STEP, LIST_STAGGER_CAP)
      : 0,
  },
});

/* ── Step / tab content swaps ─────────────────────────────────
   Used for checkout steps, PDP tabs and profile section switches.
   Enter slides in from 6px, exit leaves without a slide so the
   next panel never overlaps mid-transition. */
export const panelSwap: Variants = {
  enter: (dir: number = 1) => ({
    opacity: 0,
    x: dir * 12,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.26, ease: EASE_STANDARD },
  },
  exit: (dir: number = 1) => ({
    opacity: 0,
    x: dir * -12,
    transition: { duration: 0.18, ease: "easeIn" },
  }),
};

/* ── Real-time attention pulse ────────────────────────────────
   A one-shot scale pulse used when a REAL backend-driven value
   changes (e.g. a Pusher order-status update). Keyed on the value
   so it fires only on an actual change — never on a timer. */
export const attentionPulse: Variants = {
  rest: { scale: 1 },
  pulse: {
    scale: [1, 1.06, 0.99, 1],
    transition: { duration: 0.5, ease: EASE_STANDARD },
  },
};

/* ── Heart / bookmark toggle pop ──────────────────────────── */
export const heartPop: Variants = {
  off: { scale: 1 },
  on: {
    scale: [1, 1.35, 0.9, 1],
    transition: { duration: 0.42, ease: EASE_STANDARD },
  },
};