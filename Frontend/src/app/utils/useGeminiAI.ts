"use client";

import axios from "axios";
import { useCallback, useState } from "react";
import { baseUrl, showToast } from "./commonFunctions";

export type GeminiContext = "product" | "category" | "general";

export interface UseGeminiAIOptions {
  context?: GeminiContext;
  modelName?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface UseGeminiAIResult {
  generate: (name: string, extraContext?: string) => Promise<string | null>;
  loading: boolean;
  error: string | null;
  lastResult: string | null;
  reset: () => void;
}

// ✅ Google's currently supported GA models (Gemini 3 family). Model selection
// is managed CENTRALLY on the backend (Backend/utils/geminiConfig.js →
// AI_PRIMARY_MODEL / AI_FALLBACK_MODEL); these two constants are sent to the
// proxy endpoint as a hint and are whitelisted there. The backend also maps
// legacy model names to the configured models, so any cached build that still
// sends an old name degrades gracefully.
const DEFAULT_MODEL = "gemini-3.6-flash";

// Fallback model tried only if the primary model returns a quota-exhaustion
// error (429 / RESOURCE_EXHAUSTED).
const FALLBACK_MODEL = "gemini-3.5-flash";

// Minimum acceptable word count before we retry / give up
// (Lowered from 60 → 40 since the new bullet-point format is intentionally short)
const MIN_WORDS = 40;
// How many times to automatically retry if the AI returns a short response
const MAX_RETRIES = 2;

// Backoff delays (ms) for transient rate-limit / throttling errors
// that often resolve within seconds — we try 2s, then 5s, then give up.
const BACKOFF_DELAYS = [2000, 5000];

function buildPrompt(
  name: string,
  context: GeminiContext,
  extraContext?: string,
): string {
  const subject =
    context === "product"
      ? "product"
      : context === "category"
        ? "category"
        : "item";

  const base = [
    `You are a fun, relatable e-commerce copywriter for an online store called "Irhas'Inn Trendy Store".`,
    `Write a SHORT, SCANNABLE, BULLET-POINT style description for the following ${subject} — like a real person hyping it up to a friend, NOT a corporate robot.`,
    `${subject === "product" ? "Product" : subject === "category" ? "Category" : "Item"} Name: "${name}".`,
  ];

  if (extraContext && extraContext.trim()) {
    base.push(
      `Additional details to weave in naturally: ${extraContext.trim()}.`,
    );
  }

  base.push(
    `Tone & style requirements:`,
    `- Write like a human, not a robot. Conversational, casual, relatable.`,
    `- Keep the language simple and easy English that anyone can read.`,
    `Formatting requirements (STRICT):`,
    `- Line 1: ONE short, punchy hook line introducing the ${subject} (can include 1 emoji).`,
    `- Then 4 to 6 short bullet points, each on its own line, each starting with a relevant emoji (e.g. ✅ 🔥 💯 ⭐ 👌 🎯) instead of a dash or asterisk.`,
    `- Each bullet must be SHORT — under 12 words — and specific to THIS ${subject} (no generic filler like "high quality material").`,
    `- Last line: ONE short closing line (under 15 words) that creates urgency/desire to buy now.`,
    `- Total length: 60 to 100 words. Do not write long paragraphs.`,
    `- NO markdown formatting at all: no asterisks, no hashtags, no dash bullets, no code blocks, no headings, no labels.`,
    `- Return ONLY the description text (hook line + emoji bullets + closing line), nothing else. No intro, no "Here is your description".`,
  );

  return base.join("\n");
}

function cleanText(raw: string): string {
  if (!raw) return "";

  return raw
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*(\d+\.)\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

// Detects a hard daily quota exhaustion (non-recoverable within seconds).
// These are typically 429 HTTP status with messages like "quota exceeded",
// "resource exhausted", or "daily limit exceeded". Retrying won't help;
// we should try the fallback model instead.
function isHardQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  const text = [
    err?.message,
    err?.response?.statusText,
    err?.body,
    err?.error?.message,
    err?.error?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /429/.test(text) ||
    /quota/i.test(text) ||
    /resource.?exhausted/i.test(text) ||
    /daily.?limit/i.test(text) ||
    /exceeded/i.test(text)
  );
}

// Detects a short-term transient rate-limit or throttling error that WILL
// likely resolve after a few seconds of waiting. These are different from
// hard quota exhaustion — they're per-minute rate caps, not daily caps.
function isTransientThrottleError(err: any): boolean {
  if (!err) return false;
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return false; // 429 is always treated as hard quota
  if (status === 503 || status === 502) return true;
  const text = [
    err?.message,
    err?.response?.statusText,
    err?.body,
    err?.error?.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /rate.?limit/i.test(text) ||
    /too.?many.?requests/i.test(text) ||
    /temporary/i.test(text) ||
    /try.?again.?later/i.test(text) ||
    /throttl/i.test(text) ||
    /timeout/i.test(text) ||
    /unavailable/i.test(text)
  );
}

export function useGeminiAI(
  options: UseGeminiAIOptions = {},
): UseGeminiAIResult {
  const {
    context = "general",
    modelName,
    temperature,
    maxOutputTokens,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const generateOnce = useCallback(
    async (
      name: string,
      extraContext?: string,
      overrideModel?: string,
    ): Promise<string> => {
      const effectiveModel = overrideModel || modelName || DEFAULT_MODEL;
      const prompt = buildPrompt(name, context, extraContext);

      let res;
      try {
        // Gemini runs server-side now — the API key never reaches the browser.
        // The backend proxy forwards the exact prompt + generation config and
        // returns the finished text.
        res = await axios.post(
          `${baseUrl}product/ai/generate-description`,
          {
            prompt,
            model: effectiveModel,
            generationConfig: {
              temperature: temperature ?? 0.9,
              maxOutputTokens: maxOutputTokens ?? 600,
              topP: 0.95,
              topK: 40,
              // Disable thinking on Flash models so the full token budget goes
              // to the actual description text, not internal reasoning.
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          },
          { withCredentials: true },
        );
      } catch (err: any) {
        // Normalize the HTTP error into the SDK-style error shape the quota /
        // transient classifiers below were written against, so the fallback /
        // backoff behavior stays identical.
        const status = err?.response?.status;
        const data = err?.response?.data || {};
        const message =
          data?.message ||
          err?.message ||
          "Failed to generate content with AI";
        const normalized: any = new Error(message);
        normalized.status = status;
        normalized.response = {
          status,
          statusText: err?.response?.statusText,
        };
        normalized.body = data;
        normalized.error = { message, status: data?.status };
        throw normalized;
      }

      const raw = res?.data?.data?.text;
      return cleanText(raw);
    },
    [context, modelName, temperature, maxOutputTokens],
  );

  // Helper: attempt generation with a specific model, retrying short
  // responses but NOT transient errors (those are handled at a higher level).
  const attemptWithModel = useCallback(
    async (
      name: string,
      extraContext: string | undefined,
      model: string,
    ): Promise<{ text: string | null; error: string | null; hardQuota: boolean }> => {
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const cleaned = await generateOnce(name, extraContext, model);

          if (!cleaned) {
            lastError = "Received an empty response from Gemini";
            continue;
          }

          const wordCount = countWords(cleaned);

          if (wordCount < MIN_WORDS) {
            lastError = `Generated description was too short (${wordCount} words). Retrying...`;
            console.warn(
              `[useGeminiAI] Model ${model} attempt ${attempt}/${MAX_RETRIES} returned only ${wordCount} words, retrying...`,
            );
            continue;
          }

          return { text: cleaned, error: null, hardQuota: false };
        } catch (err: any) {
          console.error(
            `[useGeminiAI] Model ${model} attempt ${attempt}/${MAX_RETRIES} failed:`,
            err,
          );

          if (isHardQuotaError(err)) {
            return { text: null, error: null, hardQuota: true };
          }

          lastError = err?.message || "Failed to generate content with AI";
        }
      }

      return { text: null, error: lastError, hardQuota: false };
    },
    [generateOnce],
  );

  const generate = useCallback(
    async (name: string, extraContext?: string): Promise<string | null> => {
      if (!name || !name.trim()) {
        showToast("Please enter a name first", "error");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // ─── Phase 1: Try the primary model ───
        const primaryResult = await attemptWithModel(
          name,
          extraContext,
          modelName || DEFAULT_MODEL,
        );

        // Hard quota on primary → try fallback model
        if (primaryResult.hardQuota) {
          console.log(
            `[useGeminiAI] Primary model ${modelName || DEFAULT_MODEL} hit quota, trying fallback ${FALLBACK_MODEL}...`,
          );
          const fallbackResult = await attemptWithModel(
            name,
            extraContext,
            FALLBACK_MODEL,
          );

          if (fallbackResult.text) {
            setLastResult(fallbackResult.text);
            setLoading(false);
            return fallbackResult.text;
          }

          // Both models exhausted — hard daily limit
          const hardLimitMessage =
            "Daily AI limit reached for today — please write the description manually, or try again after midnight (Pacific Time, when Google resets quotas).";
          setError(hardLimitMessage);
          showToast(hardLimitMessage, "error");
          setLoading(false);
          return null;
        }

        // Primary model returned a successful text
        if (primaryResult.text) {
          setLastResult(primaryResult.text);
          setLoading(false);
          return primaryResult.text;
        }

        // Primary model failed with a non-quota error.
        // ─── Phase 2: Retry with exponential backoff for transient errors ───
        for (let backoffIdx = 0; backoffIdx < BACKOFF_DELAYS.length; backoffIdx++) {
          const delay = BACKOFF_DELAYS[backoffIdx];
          console.log(
            `[useGeminiAI] Transient error, waiting ${delay}ms before retry ${backoffIdx + 1}/${BACKOFF_DELAYS.length}...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));

          const retryResult = await attemptWithModel(
            name,
            extraContext,
            modelName || DEFAULT_MODEL,
          );

          if (retryResult.text) {
            setLastResult(retryResult.text);
            setLoading(false);
            return retryResult.text;
          }

          // If it's a hard quota now (after backoff), try fallback
          if (retryResult.hardQuota) {
            console.log(
              `[useGeminiAI] Primary model hit quota after backoff, trying fallback ${FALLBACK_MODEL}...`,
            );
            const fallbackAfterBackoff = await attemptWithModel(
              name,
              extraContext,
              FALLBACK_MODEL,
            );

            if (fallbackAfterBackoff.text) {
              setLastResult(fallbackAfterBackoff.text);
              setLoading(false);
              return fallbackAfterBackoff.text;
            }

            const hardLimitMessage =
              "Daily AI limit reached for today — please write the description manually, or try again after midnight (Pacific Time, when Google resets quotas).";
            setError(hardLimitMessage);
            showToast(hardLimitMessage, "error");
            setLoading(false);
            return null;
          }
        }

        // All backoff retries exhausted without success
        const transientMessage =
          primaryResult.error ||
          "AI service is temporarily unavailable. Please try again in a few minutes, or write the description manually.";
        setError(transientMessage);
        showToast(transientMessage, "error");
        setLoading(false);
        return null;
      } catch (err: any) {
        console.error("[useGeminiAI] Unexpected error in generate:", err);
        const unexpectedMessage =
          "An unexpected error occurred while generating the description. Please try again or write manually.";
        setError(unexpectedMessage);
        showToast(unexpectedMessage, "error");
        setLoading(false);
        return null;
      }
    },
    [attemptWithModel, modelName],
  );

  const reset = useCallback(() => {
    setError(null);
    setLastResult(null);
    setLoading(false);
  }, []);

  return { generate, loading, error, lastResult, reset };
}

export default useGeminiAI;