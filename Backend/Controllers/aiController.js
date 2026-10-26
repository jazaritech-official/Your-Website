import { createError, createSuccess } from "../utils/commonFunctions.js";
import {
  generateWithFallback,
  resolveGeminiModel,
  GEMINI_CONFIG,
} from "../utils/geminiConfig.js";
import { debugLog } from "../utils/debugLog.js";
import sharp from "sharp";

/*
===========================================================
AI DESCRIPTION GENERATION — SERVER-SIDE PROXY
===========================================================
The Gemini API key (process.env.GEMINI_API_KEY) lives ONLY on the
backend. The browser never sees it: the admin UI sends the prompt
and generation options to this endpoint, and the server performs
the actual Gemini call and returns the finished text.

Models are managed CENTRALLY in utils/geminiConfig.js
(env: AI_PRIMARY_MODEL / AI_FALLBACK_MODEL). The requested model is tried
first and the configured fallback is used automatically on 404 / quota /
transient failures. Clients may request only the configured models (legacy
model names are mapped to them) so a malicious client can never invoke
arbitrary models. Raw Gemini errors are never forwarded — only safe,
standardized errors (the HTTP status, e.g. 429 for quota, is preserved so
the client's existing quota / transient-error classification works).
===========================================================
*/

// Clients may request either configured model (or a legacy alias, which
// resolves to one). Anything else falls back to the primary model.
const DEFAULT_MODEL = GEMINI_CONFIG.primary;

// Prompts are short marketing briefs (< 1KB); this cap only stops abuse.
const MAX_PROMPT_LENGTH = 8000;

// Strip the client request down to a validated, bounded generation config.
// Non-numeric / out-of-range values are dropped rather than rejected so a
// missing option behaves exactly like the SDK default.
function sanitizeGenerationConfig(raw) {
  if (!raw || typeof raw !== "object") return undefined;

  const config = {};
  const numericFields = ["temperature", "maxOutputTokens", "topP", "topK"];
  for (const field of numericFields) {
    const value = raw[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      config[field] = value;
    }
  }

  if (raw.thinkingConfig && typeof raw.thinkingConfig === "object") {
    const budget = Number(raw.thinkingConfig.thinkingBudget);
    if (Number.isFinite(budget)) {
      config.thinkingConfig = { thinkingBudget: budget };
    }
  }

  return Object.keys(config).length ? config : undefined;
}

export const generateDescription = async (req, res, next) => {
  try {
    const { prompt, model, generationConfig } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return next(createError(400, "Prompt is required"));
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return next(
        createError(400, `Prompt must be under ${MAX_PROMPT_LENGTH} characters`)
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return next(createError(500, "Gemini API key is not configured"));
    }

    const effectiveModel = resolveGeminiModel(model || DEFAULT_MODEL);

    const config = sanitizeGenerationConfig(generationConfig);
    const result = await generateWithFallback({
      contents: prompt,
      generationConfig: config,
      // Client-requested model first, configured fallback after.
      preferredModel: effectiveModel,
      timeoutMs: 45_000,
    });

    return res
      .status(200)
      .json(createSuccess(200, "AI description generated", { text: result.text }));
  } catch (error) {
    // Standardized error only — raw Gemini messages never reach the client.
    // The HTTP status is preserved (429 for quota) so the client's existing
    // quota / transient-error classification keeps working unchanged.
    const status = error?.status || 500;
    return next(
      createError(
        status,
        error?.message || "AI generation failed",
        error?.code || (status === 429 ? "AI_QUOTA_EXCEEDED" : undefined)
      )
    );
  }
};

/* ============================================================
   AI PRODUCT METADATA FROM IMAGE — GEMINI VISION (ADMIN ONLY)
   ============================================================
   Receives the actual selected product image file via multipart
   (memory storage — upload.single("image") on the route). The
   image is validated and normalized transiently with sharp
   (never stored on disk, never uploaded to Cloudinary) and then
   analyzed by Gemini Vision. Returns { name, description } that
   the admin reviews/edits before the existing product creation
   flow runs unchanged.
   ============================================================ */

const METADATA_PROMPT = `You are analyzing a product image for an e-commerce store.

Inspect the actual product image and identify:
- What the product is and its type
- Visible colors, design, and style
- Material only if it is clearly visible
- Intended use if it can be reasonably inferred
- Key visible features

Return ONLY a JSON object with no markdown, no backticks, no explanation:
{
  "name": "concise e-commerce product title",
  "description": "professional e-commerce product description"
}

Rules for the name:
- Concise, natural, searchable, product-focused
- No keyword stuffing, no invented brand names or model numbers
- No claims not supported by the image
- No quotation marks, no markdown

Rules for the description:
- Professional, readable, useful for customers, reasonably detailed
- Based strictly on visible evidence; never invent dimensions, materials, or certifications
- No medical/safety claims unless clearly visible
- Avoid excessive marketing language
- If the image provides too little information, give a generic but accurate description instead of inventing details
- Do not mention AI generation`;

// Only these real formats are accepted for AI analysis (validated from the
// actual image bytes via sharp metadata — the client MIME header is never trusted).
const SUPPORTED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp"]);

export const generateProductMetadata = async (req, res, next) => {
  try {
    // 1. Require an actual image file.
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return next(
        createError(400, "Please select a product image first", "IMAGE_REQUIRED")
      );
    }

    // 2. Validate the real image format (content, not header).
    let metadata;
    try {
      metadata = await sharp(req.file.buffer, {
        limitInputPixels: 64 * 1024 * 1024,
      }).metadata();
    } catch (err) {
      return next(
        createError(400, "The selected file is not a valid image", "INVALID_IMAGE")
      );
    }
    if (!metadata.format || !SUPPORTED_IMAGE_FORMATS.has(metadata.format)) {
      return next(
        createError(400, "Only JPEG, PNG, or WebP images are supported", "INVALID_IMAGE")
      );
    }

    // 3. Normalize transiently (max 1024px wide, JPEG q85) — memory only.
    let normalized;
    try {
      normalized = await sharp(req.file.buffer, {
        limitInputPixels: 64 * 1024 * 1024,
      })
        .resize({ width: 1024, withoutEnlargement: true })
        .flatten({ background: "#FFFFFF" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (err) {
      return next(
        createError(400, "Image could not be processed", "IMAGE_PROCESS_FAILED")
      );
    }

    // 4. Optional context (trimmed & capped to keep the prompt bounded).
    const category = String(req.body?.category ?? "").trim().slice(0, 100) || undefined;
    const existingName = String(req.body?.name ?? "").trim().slice(0, 100) || undefined;
    const existingDescription =
      String(req.body?.description ?? "").trim().slice(0, 100) || undefined;

    const prompt = [
      METADATA_PROMPT,
      category ? `Category context: ${category}` : "",
      existingName
        ? `Existing product name (use only as reference, replace with a better name if warranted): ${existingName}`
        : "",
      existingDescription
        ? `Existing description (use only as reference): ${existingDescription}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // 5. Gemini Vision via the centralized client (primary → fallback).
    let result;
    try {
      result = await generateWithFallback({
        contents: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: normalized.toString("base64"),
            },
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
        timeoutMs: 45_000,
      });
    } catch (error) {
      console.warn(
        "[AIMetadata] Gemini call failed:",
        error?.code || error?.status || "AI_UNAVAILABLE"
      );
      const status = error?.status || 500;
      return next(
        createError(
          status,
          error?.message || "AI could not analyze this image. Please try again.",
          error?.code || "AI_UNAVAILABLE"
        )
      );
    }
    debugLog(
      `[AIMetadata] Gemini model used: ${result.model}${result.usedFallback ? " (fallback)" : ""
      } (finishReason=${result.finishReason})`
    );

    // 6. Parse strict JSON (defensively strip fences / surrounding text).
    let parsed = null;
    try {
      const cleaned = result.text.replace(/```(?:json)?/gi, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end > start) {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      }
    } catch (err) {
      parsed = null;
    }

    const name =
      typeof parsed?.name === "string" ? parsed.name.trim().slice(0, 120) : "";
    const description =
      typeof parsed?.description === "string"
        ? parsed.description.trim().slice(0, 2000)
        : "";

    if (!name || !description) {
      return next(
        createError(
          502,
          "AI returned incomplete product details",
          "AI_INVALID_RESPONSE"
        )
      );
    }

    // 7. Success — admin reviews/edits these before the existing submit flow.
    return res
      .status(200)
      .json(
        createSuccess(200, "Product metadata generated successfully", {
          name,
          description,
        })
      );
  } catch (error) {
    console.error("[AIMetadata] Unexpected error:", error);
    return next(error);
  }
};
