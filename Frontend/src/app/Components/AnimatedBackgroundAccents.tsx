/**
 * AnimatedBackgroundAccents
 * ------------------------------------------------------------
 * The site's ONE ambient background layer: an asymmetric ROW × COLUMN
 * architectural grid of rounded rectangular panels — "living architecture"
 * behind the storefront rather than four floating blobs. Mounted exactly
 * once, in `app/layout.tsx`, so a single instance covers every route —
 * storefront, product, cart, checkout, profile, chat, admin and rider. Do
 * not render it anywhere else, or it will paint twice.
 *
 * Composition (see the matching rules in globals.css):
 *   • 4 unequal columns × 4 unequal rows, selectively filled — some slots
 *     are deliberately EMPTY so the field breathes and never reads as a
 *     table or checkerboard.
 *   • 9 fill panels: 4 gold, 2 navy, 2 near-neutral and ONE micro red
 *     accent (comfortably under the 10% red budget).
 *   • 4 hairline divider lines sitting on row/column seams.
 *   • 1 slow gold highlight sweep for the "shining" quality.
 *   • 16 decorative DOM nodes in total — deliberately tiny.
 *
 * Design constraints (deliberate — see the matching rules in globals.css):
 *   • Pure CSS `@keyframes` only. No setInterval/setTimeout, no
 *     requestAnimationFrame, no per-frame React state, no canvas/WebGL/SVG
 *     filters — this is a Server Component that never re-renders and ships no
 *     client JavaScript.
 *   • Colours are drawn from the storefront's LIVE theme custom properties
 *     (`--color-brand-*`, `--color-surface-*`), which dynamicTheme.ts
 *     overrides at runtime. An Admin palette change therefore re-tints the
 *     accents automatically — nothing is hardcoded, and a dark palette
 *     automatically gets a dark base instead of washing out.
 *   • `position: fixed; inset: 0; z-index: -1` keeps it strictly behind all
 *     content, headers, modals and dropdowns without affecting layout, CLS,
 *     scrollbars or horizontal overflow (the grid's slight negative inset is
 *     clipped by that container).
 *   • `pointer-events: none` + `aria-hidden`, so it can never intercept a
 *     click or be announced by assistive tech.
 *   • Animates only `opacity` and `transform` (GPU-composited); no
 *     layout-affecting properties.
 *   • Density, opacity and travel scale down on tablet/mobile through the
 *     `--ir-k` / `--ir-m` multipliers instead of per-cell overrides.
 *   • Frozen but still a complete, designed composition under
 *     `prefers-reduced-motion: reduce`.
 */
const AnimatedBackgroundAccents = () => {
  return (
    <div aria-hidden="true" className="ir-ambient-accents">
      <div className="ir-ambient-grid">
        {/* Structural panels — gold / navy / neutral / one micro red accent */}
        <span className="ir-ambient-cell ir-ambient-cell--gold-tall" />
        <span className="ir-ambient-cell ir-ambient-cell--navy-top" />
        <span className="ir-ambient-cell ir-ambient-cell--gold-cell" />
        <span className="ir-ambient-cell ir-ambient-cell--neutral-tall" />
        <span className="ir-ambient-cell ir-ambient-cell--navy-block" />
        <span className="ir-ambient-cell ir-ambient-cell--gold-hero" />
        <span className="ir-ambient-cell ir-ambient-cell--accent" />
        <span className="ir-ambient-cell ir-ambient-cell--neutral-strip" />
        <span className="ir-ambient-cell ir-ambient-cell--gold-corner" />
        {/* Hairline row/column dividers — discovered, not announced */}
        <span className="ir-ambient-line ir-ambient-line--v1" />
        <span className="ir-ambient-line ir-ambient-line--v2" />
        <span className="ir-ambient-line ir-ambient-line--h1" />
        <span className="ir-ambient-line ir-ambient-line--h2" />
      </div>
      {/* One slow gold highlight travelling across the field */}
      <span className="ir-ambient-sweep" />
    </div>
  );
};

export default AnimatedBackgroundAccents;
