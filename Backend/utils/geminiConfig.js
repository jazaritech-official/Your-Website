/* ============================================================
   GEMINI AI — centralized model configuration & resilient client
   ------------------------------------------------------------
   Model migration is now a ONE-LINE change: set the env vars
   (or edit the two defaults below) and every AI feature follows.

     AI_PRIMARY_MODEL   — default "gemini-3.6-flash"  (GA, Jul 2026)
     AI_FALLBACK_MODEL  — default "gemini-3.5-flash"  (GA, supported to May 2027)

   The deprecated models (gemini-2.5-flash / gemini-2.0-flash) have been
   removed from every active code path. Their names are still accepted from
   older/cached clients and transparently mapped to the configured models,
   so no already-deployed frontend breaks when the API changes.

   Every Gemini call in this project goes through generateWithFallback(),
   which:
   - tries the requested (or primary) model FIRST,
   - on a transient 503 ("high demand") or 429 (rate/quota) waits ~1.5s and
     retries the SAME model once — Google's infrastructure often recovers in
     seconds — before moving to the other configured model,
   - on 404 (model unavailable) / timeout / other transient errors falls
     through to the other configured model immediately (no wasted backoff
     for errors that retrying cannot fix), 400/401/403 are never retried,
   - returns { text, model, usedFallback, finishReason } so callers can tell
     a clean STOP from a MAX_TOKENS truncation,
   - NEVER leaks raw Gemini errors to callers — it throws standardized
     errors carrying only { status, message, code }.
   ============================================================ */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { debugLog } from "./debugLog.js";

// Models Google has RETIRED (they 404 with "no longer available"). These are
// NEVER selected as a callable model — even if a stale AI_PRIMARY_MODEL /
// AI_FALLBACK_MODEL env value still exists in a deployment (e.g. a Vercel
// production override set months ago), the name is overridden to the current
// supported default and a loud warning is logged so the stale config is
// visible in production logs.
const DEPRECATED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
]);

function resolveConfiguredModel(raw, dflt) {
  const name = String(raw || dflt).trim();
  if (DEPRECATED_MODELS.has(name)) {
    console.warn(
      `[Gemini] ⚠ Configured model "${name}" is deprecated and no longer served by Google — ` +
        `falling back to "${dflt}". Remove the stale AI_PRIMARY_MODEL / AI_FALLBACK_MODEL ` +
        `env override from this deployment.`
    );
    return dflt;
  }
  return name;
}

const AI_PRIMARY_MODEL = resolveConfiguredModel(
  process.env.AI_PRIMARY_MODEL,
  "gemini-3.6-flash"
);
const AI_FALLBACK_MODEL = resolveConfiguredModel(
  process.env.AI_FALLBACK_MODEL,
  "gemini-3.5-flash"
);
const ALLOWED_MODELS = [AI_PRIMARY_MODEL, AI_FALLBACK_MODEL];

// Legacy (deprecated) model names → configured models, so a stale client
// that still sends them keeps working unchanged.
const LEGACY_ALIASES = {
  "gemini-2.5-flash": AI_PRIMARY_MODEL,
  "gemini-2.0-flash": AI_FALLBACK_MODEL,
};

const DEFAULT_TIMEOUT_MS = 60_000;

export const GEMINI_CONFIG = {
  primary: AI_PRIMARY_MODEL,
  fallback: AI_FALLBACK_MODEL,
  allowed: ALLOWED_MODELS,
};

/** Resolve a client-requested model to one of the configured models. */
export function resolveGeminiModel(requested) {
  if (ALLOWED_MODELS.includes(requested)) return requested;
  return LEGACY_ALIASES[requested] || AI_PRIMARY_MODEL;
}

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("Gemini API key is not configured");
    err.status = 500;
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }
  return new GoogleGenerativeAI(apiKey);
}

/** Classify an SDK / fetch error into a stable, safe category. */
export function classifyGeminiError(err) {
  const status = err?.status || err?.response?.status;
  const text = [err?.message, err?.statusText, err?.errorDetails]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    status === 429 ||
    /429/.test(text) ||
    /quota|resource.?exhausted|daily.?limit/i.test(text)
  ) {
    // 429 = throttling/quota. The per-model retry policy in
    // generateWithFallback retries it once as transient, so the flag is
    // informational and aligned with that policy.
    return { type: "quota", status: 429, retryable: true };
  }
  if (
    status === 404 ||
    /404/.test(text) ||
    /model.*not found|not found.*model/i.test(text)
  ) {
    return { type: "model-unavailable", status: 404, retryable: true };
  }
  if (status === 400) {
    return { type: "invalid", status: 400, retryable: false };
  }
  if (
    err?.name === "AbortError" ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /timeout|abort|temporarily|unavailable|throttl|rate.?limit|too.?many.?requests|econnreset|econnrefused/i.test(
      text
    )
  ) {
    return { type: "transient", status: status || 503, retryable: true };
  }
  return { type: "unknown", status: status || 500, retryable: false };
}

// Gemini returns finishReason as a string enum ("STOP", "MAX_TOKENS", ...).
// Normalize defensively (older SDK shapes may expose a number) so callers can
// compare reliably and logs stay readable. "MAX_TOKENS" proves the model hit
// its output-token ceiling mid-response (i.e. the JSON was truncated).
const FINISH_REASON_LABELS = {
  0: "UNSPECIFIED",
  1: "STOP",
  2: "MAX_TOKENS",
  3: "SAFETY",
  4: "RECITATION",
  5: "LANGUAGE",
  6: "OTHER",
  7: "BLOCKLIST",
  8: "PROHIBITED_CONTENT",
  9: "SPII",
  10: "MALFORMED_FUNCTION_CALL",
};

function finishReasonLabel(value) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number")
    return FINISH_REASON_LABELS[value] || String(value);
  return "N/A";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Safe, user-facing messages — raw Gemini error text is never forwarded.
const SAFE_MESSAGES = {
  quota: "The AI service daily limit has been reached. Please try again later.",
  "model-unavailable":
    "The AI service is temporarily unavailable. Please try again later.",
  transient:
    "The AI service is temporarily unavailable. Please try again later.",
  invalid: "The AI request could not be processed.",
  unknown: "The AI service is temporarily unavailable. Please try again later.",
};

/**
 * Run generateContent on the preferred (or primary) model; on quota /
 * model-unavailable / transient failures automatically retry with the other
 * configured model.
 *
 * @param {object} options
 * @param {string|Array} options.contents  Prompt or content parts (multimodal).
 * @param {object} [options.generationConfig] SDK generation config.
 * @param {string} [options.preferredModel] Client-requested model (resolved via
 *   resolveGeminiModel). Defaults to the configured primary.
 * @param {number} [options.timeoutMs] Per-request timeout.
 * @returns {Promise<{text: string, model: string, usedFallback: boolean,
 *   finishReason: string}>} finishReason is the model's stop reason
 *   ("STOP" | "MAX_TOKENS" | ...) — lets callers detect JSON truncation.
 * @throws {Error} A standardized error with { status, message, code } — never
 *   a raw Gemini error.
 */
export async function generateWithFallback({
  contents,
  generationConfig,
  preferredModel,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const genAI = getGenAI();

  // Preferred model first (honors the client's explicit request), then the
  // other configured model — deduped so the same model is never tried twice.
  const attempts = [];
  const preferred = preferredModel ? resolveGeminiModel(preferredModel) : null;
  if (preferred) {
    attempts.push({ name: preferred, primary: preferred === AI_PRIMARY_MODEL });
  }
  for (const name of [AI_PRIMARY_MODEL, AI_FALLBACK_MODEL]) {
    if (!attempts.some((a) => a.name === name)) {
      attempts.push({ name, primary: name === AI_PRIMARY_MODEL });
    }
  }

  let last = null;
  // Transient (503 high-demand / 429 throttling) gets ONE retry of the SAME
  // model after a short backoff — Google's overload often clears in seconds.
  // 400/401/403/404 are NEVER retried (they cannot resolve by waiting), so no
  // time or budget is wasted on errors that will fail identically again.
  const MAX_MODEL_ATTEMPTS = 2;
  const RETRY_BACKOFF_MS = 1500;

  for (const { name, primary } of attempts) {
    const modelStartedAt = Date.now();
    let attemptNo = 0;
    while (attemptNo < MAX_MODEL_ATTEMPTS) {
      attemptNo++;
      const attemptStartedAt = Date.now();
      try {
        const attemptStart = Date.now();
        debugLog(
          `[Gemini] attempting model "${name}" (attempt ${attemptNo}/${MAX_MODEL_ATTEMPTS})${primary ? " (primary)" : " (fallback)"}`
        );
        const modelParams = { model: name };
        if (generationConfig) modelParams.generationConfig = generationConfig;
        const model = genAI.getGenerativeModel(modelParams);
        const result = await model.generateContent(contents, {
          timeout: timeoutMs,
        });
        const response = result?.response;
        if (response?.promptFeedback?.blockReason) {
          const err = new Error("The AI request could not be processed.");
          err.status = 400;
          err.code = "AI_BLOCKED";
          throw err;
        }
        const text =
          typeof response?.text === "function" ? response.text() : "";
        const finishReason = finishReasonLabel(
          response?.candidates?.[0]?.finishReason
        );
        if (!text || !text.trim()) {
          // Empty result (e.g. content filtered) — try the other model.
          last = { type: "transient", status: 502, retryable: true };
          console.warn(
            `[Gemini] model "${name}" returned an empty response (finishReason=${finishReason}) after ${Date.now() - attemptStartedAt}ms`
          );
          break;
        }
        debugLog(
          `[Gemini] model "${name}" responded (finishReason=${finishReason}, attempt ${attemptNo}/${MAX_MODEL_ATTEMPTS}, ${primary ? "primary" : "fallback"}) in ${Date.now() - attemptStartedAt}ms`
        );
        debugLog(`[PERF] Gemini total attempt: ${Date.now() - attemptStart}ms`);
        return { text, model: name, usedFallback: !primary, finishReason };
      } catch (err) {
        last = classifyGeminiError(err);
        console.warn(
          `[Gemini] model "${name}" failed (${last.type}):`,
          err?.message || err
        );
        // Retry ONLY genuine HTTP 503 (high demand) / 429 (throttling) — the
        // conditions that resolve on their own. classifyGeminiError maps a
        // timeout (AbortError) to status 503 via its `status || 503` fallback,
        // so a timed-out attempt is explicitly EXCLUDED here: retrying it
        // would double the 50s print-layout budget per model for a problem
        // retrying cannot fix. 400/401/403/404 are never retried either.
        const isTimeout = err?.name === "AbortError";
        const transient =
          (last.status === 503 || last.status === 429) && !isTimeout;
        const elapsedMs = Date.now() - modelStartedAt;
        if (transient && attemptNo < MAX_MODEL_ATTEMPTS) {
          debugLog(
            `[Gemini] model "${name}" ${last.status} (attempt ${attemptNo}/${MAX_MODEL_ATTEMPTS}) — retrying in ${RETRY_BACKOFF_MS / 1000}s (${elapsedMs}ms elapsed)`
          );
          await sleep(RETRY_BACKOFF_MS);
          continue;
        }
        if (transient) {
          debugLog(
            `[Gemini] model "${name}" ${last.status} (attempt ${attemptNo}/${MAX_MODEL_ATTEMPTS}) — moving to next model (${elapsedMs}ms elapsed)`
          );
        }
        // Non-transient error, or both attempts of this model exhausted → the
        // outer loop advances to the other configured model.
        break;
      }
    }
  }

  const status = last?.status || 503;
  const code =
    last?.type === "quota"
      ? "AI_QUOTA_EXCEEDED"
      : last?.type === "invalid"
        ? "AI_INVALID_REQUEST"
        : "AI_UNAVAILABLE";
  const err = new Error(SAFE_MESSAGES[last?.type] || SAFE_MESSAGES.unknown);
  err.status = status;
  err.code = code;
  throw err;
}
