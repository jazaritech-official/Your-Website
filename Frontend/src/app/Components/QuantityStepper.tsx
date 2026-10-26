"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { DUR_MICRO, EASE_STANDARD } from "../utils/motion";

interface QuantityStepperProps {
  /** Current quantity value shown in the middle. */
  quantity: number;
  /** Called when the user taps the minus button. */
  onDecrease: () => void;
  /** Called when the user taps the plus button. */
  onIncrease: () => void;
  /** Quantity floor — the minus button is disabled once quantity === min. */
  min?: number;
  /**
   * Quantity ceiling for manual entry — usually the available stock.
   * Values typed above this are clamped down. Optional.
   */
  max?: number;
  /**
   * Called when the user types a quantity and commits it (blur or Enter).
   * It receives the same clamped value the +/- buttons would produce, so the
   * parent keeps a single source of truth. When omitted the middle stays a
   * plain read-only label — all pre-existing call sites are unaffected.
   */
  onQuantityChange?: (quantity: number) => void;
}

/**
 * Quantity stepper — the single shared control used by the Cart page and the
 * Checkout page.
 *
 * Extracted verbatim from the Cart page's markup so every consumer gets the
 * exact same look/feel and the exact same optimistic-update handlers — never
 * build a second quantity control from scratch.
 *
 * Manual entry (REQ 3a): the middle number becomes an editable input when
 * `onQuantityChange` is provided. Typing goes through a local draft so the
 * field can be temporarily empty mid-edit; committing (blur/Enter) parses,
 * strips anything non-numeric (decimals/negatives blocked), clamps to
 * [min, max] and routes through the SAME handler the +/- buttons use.
 */
const QuantityStepper = ({
  quantity,
  onDecrease,
  onIncrease,
  min = 1,
  max,
  onQuantityChange,
}: QuantityStepperProps) => {
  const atMin = quantity <= min;

  // Draft text while the input is being edited; null means "not editing".
  const [draft, setDraft] = useState<string | null>(null);

  const startEditing = () => {
    if (!onQuantityChange) return;
    setDraft(String(quantity));
  };

  const commitDraft = () => {
    if (draft === null) return;
    setDraft(null); // always exit edit mode first
    if (!onQuantityChange) return;

    // Integers only — parseInt naturally drops decimals ("2.5" → 2) and any
    // stray sign characters are already stripped during typing.
    const parsed = Number.parseInt(draft, 10);
    let next = Number.isNaN(parsed) ? quantity : Math.trunc(parsed);
    if (next < min) next = min;
    if (typeof max === "number" && next > max) next = max;
    if (next !== quantity) onQuantityChange(next);
  };

  const handleDraftChange = (value: string) => {
    // Digits only while typing: blocks negatives, decimals, spaces, etc.
    // An empty string is allowed so the field isn't hostile mid-edit; the
    // commit step falls back to the current quantity if left empty.
    setDraft(value.replace(/[^0-9]/g, ""));
  };

  return (
    <div
      className="inline-flex items-center gap-3 rounded-3xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand-navy"
      aria-label={`Quantity: ${quantity}`}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={atMin}
        aria-label="Decrease quantity"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-brand-navy shadow-sm transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus size={18} />
      </button>

      {onQuantityChange && draft !== null ? (
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={draft}
          aria-label="Edit quantity"
          onChange={(e) => handleDraftChange(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
            if (e.key === "Escape") setDraft(null);
          }}
          className="min-w-[1.25rem] w-12 rounded-md border border-brand-gold/40 bg-brand-gold/5 p-0 text-center tabular-nums outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
        />
      ) : (
        /* Keyed on the value so the number re-mounts and gives a short
           pop every time the quantity actually changes — no timer, no
           extra state, and it only fires on a real change. */
        <motion.span
          key={quantity}
          initial={{ opacity: 0.35, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR_MICRO, ease: EASE_STANDARD }}
          className={
            onQuantityChange
              ? "min-w-[1.25rem] cursor-text text-center tabular-nums"
              : "min-w-[1.25rem] text-center tabular-nums"
          }
          onClick={startEditing}
        >
          {quantity}
        </motion.span>
      )}

      <button
        type="button"
        onClick={onIncrease}
        aria-label="Increase quantity"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-brand-navy shadow-sm transition hover:bg-surface-muted"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};

export default QuantityStepper;
