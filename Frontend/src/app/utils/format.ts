/**
 * Shared display formatters.
 *
 * Server-safe (no "use client") so it can be imported from any component tier.
 */

/**
 * Render a PKR amount exactly as the storefront always has:
 *   `Rs ${value.toLocaleString()}`
 *
 * This reproduces the previous inline output CHARACTER-FOR-CHARACTER for every
 * value the app actually renders:
 *   • number / string  → `Rs ` + `value.toLocaleString()`
 *   • null / undefined → `Rs undefined` (identical to the old
 *     `${value?.toLocaleString()}` optional-chained output, where optional
 *     chaining short-circuits to `undefined`) — so no behaviour changes on the
 *     nullable call sites either.
 *
 * The default locale/timezone is intentionally NOT pinned: adding locale
 * arguments would change the rendered string, which this consolidation must
 * avoid. Callers therefore get byte-identical output to the inline versions.
 */
export const formatPKR = (value: number | string | null | undefined): string =>
  `Rs ${value == null ? "undefined" : value.toLocaleString()}`;
