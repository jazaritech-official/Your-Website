/**
 * debugLog — lightweight debug-only logger.
 *
 * Wraps console.log so it only fires when DEBUG_LOG=true or when
 * NODE_ENV is not "production". This eliminates ~130+ per-request
 * and per-connection log lines from production serverless output
 * while preserving full visibility during local development.
 *
 * console.error / console.warn are intentionally NOT wrapped —
 * those should always fire, even in production.
 */

const _isDebug =
  process.env.DEBUG_LOG === "true" || process.env.NODE_ENV !== "production";

/**
 * Debug-only log. No-ops in production unless DEBUG_LOG=true.
 * @param  {...any} args — same signature as console.log
 */
export function debugLog(...args) {
  if (_isDebug) console.log(...args);
}
