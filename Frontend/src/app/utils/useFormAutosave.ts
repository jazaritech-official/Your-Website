"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * useFormAutosave
 *
 * A small resilience layer that preserves form input data across accidental page
 * refreshes (browser reload, back/forward navigation) within the current browsing
 * session.
 *
 * - Saves form state to `sessionStorage` on every meaningful change.
 * - Restores saved draft on mount (hydrates the form's initial state).
 * - Clears the draft on successful form submission so old data doesn't linger.
 * - Scoped to `sessionStorage` (NOT localStorage) so drafts don't persist
 *   indefinitely across unrelated future visits — they're automatically cleared
 *   when the user closes the tab.
 *
 * @param storageKey - A unique key for this form (e.g. "checkout_form_draft").
 * @returns An object with:
 *   - `restore()`     – call during initialisation to get saved draft (or null)
 *   - `save(current) ` – call whenever the form state changes
 *   - `clear()`       – call after successful submission
 */
export function useFormAutosave<T extends Record<string, any>>(
  storageKey: string,
) {
  /**
   * Load a previously saved draft from sessionStorage.
   * Returns `null` if no draft exists or parsing fails.
   */
  const restore = useCallback((): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [storageKey]);

  /**
   * Persist the current form state to sessionStorage.
   */
  const save = useCallback(
    (current: T) => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(current));
      } catch {
        // sessionStorage quota exceeded or blocked — silently ignore
      }
    },
    [storageKey],
  );

  /**
   * Remove the saved draft from sessionStorage (call after successful submit).
   */
  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // silently ignore
    }
  }, [storageKey]);

  return { restore, save, clear };
}

export default useFormAutosave;
