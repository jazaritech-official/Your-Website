import { ThemeSettings } from "../Models/ThemeSettings.js";
import {
  createError,
  createSuccess,
  signThemeRevalidateTicket,
} from "../utils/commonFunctions.js";
import { safeGet, safeSet, safeDel } from "../utils/redisCache.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import {
  THEME_TOKEN_REGISTRY,
  THEME_COLOR_KEYS,
  DEFAULT_THEME_COLORS,
  DEFAULT_BRANDING,
  isValidHexColor,
  SEMANTIC_COLOR_KEYS,
  meetsSemanticContrast,
} from "../utils/themeDefaults.js";
import { THEME_PRESETS } from "../utils/themePresets.js";

/* ===========================================================
   THEME / BRANDING CONTROLLER
   -----------------------------------------------------------
   Follows the exact conventions of settingsController.js:
     • singleton read via findOneAndUpdate + $setOnInsert
     • a "public shape" that exposes only storefront-safe fields
     • Redis cache-aside (safeGet/safeSet) with explicit
       invalidation (safeDel) the moment an Admin saves

   The public theme is read by the storefront's ROOT LAYOUT on
   every page render, so it must be a single tiny document and it
   must never be able to throw (a theme outage must degrade to the
   compiled Tailwind defaults, not to a broken page).
   =========================================================== */

const THEME_KEY = "theme";
const THEME_CACHE_KEY = "app:theme";
const THEME_CACHE_TTL = 300; // 5 minutes — mirrors app:settings

/** Read the singleton, creating it (with defaults) on first use. */
const readTheme = async () => {
  return ThemeSettings.findOneAndUpdate(
    { key: THEME_KEY },
    { $setOnInsert: { key: THEME_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
};

/**
 * Merge a stored document into a COMPLETE theme payload.
 * Any missing/invalid field falls back to the compiled default, so the
 * storefront always receives a full, usable set of tokens — it never has to
 * know what the defaults are, and a partially-written legacy doc can never
 * render an undefined colour.
 */
const resolveTheme = (doc) => {
  const stored = (doc && doc.colors) || {};
  const colors = {};
  for (const key of THEME_COLOR_KEYS) {
    colors[key] = isValidHexColor(stored[key])
      ? String(stored[key]).trim()
      : DEFAULT_THEME_COLORS[key];
  }

  const siteName =
    typeof doc?.siteName === "string" && doc.siteName.trim()
      ? doc.siteName.trim()
      : DEFAULT_BRANDING.siteName;
  const tagline =
    typeof doc?.tagline === "string" && doc.tagline.trim()
      ? doc.tagline.trim()
      : DEFAULT_BRANDING.tagline;

  // The storefront injects these straight into a `:root` style block. Serving
  // the CSS custom-property NAMES from here (instead of a hardcoded map in the
  // frontend) keeps `utils/themeDefaults.js` the single source of truth for
  // which token maps to which variable — the frontend needs zero knowledge of
  // the mapping and can never drift out of sync with it.
  const cssVars = {};
  for (const token of THEME_TOKEN_REGISTRY) {
    cssVars[token.cssVar] = colors[token.apiKey];
  }

  return {
    colors,
    cssVars,
    // Empty string = "use the built-in asset" (frontend falls back).
    logoUrl: typeof doc?.logoUrl === "string" ? doc.logoUrl.trim() : "",
    siteName,
    tagline,
    updatedAt: doc?.updatedAt || null,
  };
};

/** Cached read of the resolved public theme. Never throws. */
const getResolvedTheme = async () => {
  try {
    const cached = await safeGet(THEME_CACHE_KEY);
    if (cached) return cached;
  } catch {
    // safeGet already swallows — belt and braces.
  }
  const doc = await readTheme();
  const payload = resolveTheme(doc);
  await safeSet(THEME_CACHE_KEY, payload, THEME_CACHE_TTL);
  return payload;
};

// ── 1. PUBLIC: theme tokens + branding (no auth) ──
// Read on every storefront page render by the root layout.
export const getPublicTheme = async (req, res, next) => {
  try {
    const payload = await getResolvedTheme();
    // Themed responses are safe to cache briefly at the edge; the
    // admin save invalidates the server cache AND the Next ISR tag.
    res.set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return res
      .status(200)
      .json(createSuccess(200, "Theme fetched", payload));
  } catch (error) {
    next(error);
  }
};

// ── 2. ADMIN: editable theme + the canonical defaults + registry ──
// The registry and defaults are served from here so the Admin UI (and
// "Reset to Default") never hardcode a second copy of them.
export const getThemeAdmin = async (req, res, next) => {
  try {
    const doc = await readTheme();
    return res.status(200).json(
      createSuccess(200, "Theme fetched", {
        theme: resolveTheme(doc),
        defaults: {
          colors: DEFAULT_THEME_COLORS,
          ...DEFAULT_BRANDING,
        },
        registry: THEME_TOKEN_REGISTRY,
        // Curated palettes for the "Choose a Palette" picker. Served from the
        // backend so new palettes ship without a frontend release. Selecting one
        // only fills in the colour fields above — it is not a separate save path.
        presets: THEME_PRESETS,
      })
    );
  } catch (error) {
    next(error);
  }
};

// ── 3. ADMIN: update colours / site name / tagline ──
// Whitelisted fields only; every colour must be a valid hex string.
export const updateTheme = async (req, res, next) => {
  try {
    const { colors, siteName, tagline } = req.body || {};
    const updates = {};

    if (colors !== undefined) {
      if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
        return next(createError(400, "colors must be an object"));
      }
      const cleanColors = {};
      for (const [key, value] of Object.entries(colors)) {
        // Unknown keys are ignored — a client can never write arbitrary
        // fields into the singleton.
        if (!THEME_COLOR_KEYS.includes(key)) continue;
        if (!isValidHexColor(value)) {
          return next(
            createError(
              400,
              `"${key}" must be a valid hex colour (e.g. #C8A84E)`
            )
          );
        }
        // F-11: semantic status tokens are exposed but must stay accessible
        // — minimum 3:1 contrast against white (WCAG 1.4.11).
        if (SEMANTIC_COLOR_KEYS.includes(key) && !meetsSemanticContrast(value)) {
          return next(
            createError(
              400,
              `"${key}" must keep at least 3:1 contrast against white so status badges stay accessible`
            )
          );
        }
        cleanColors[key] = String(value).trim();
      }
      if (Object.keys(cleanColors).length === 0) {
        return next(createError(400, "No valid colour tokens supplied"));
      }
      // Merge per-token so a partial palette update never resets the rest.
      for (const [key, value] of Object.entries(cleanColors)) {
        updates[`colors.${key}`] = value;
      }
    }

    if (siteName !== undefined) {
      const name = String(siteName).trim();
      if (!name) {
        return next(createError(400, "Site name cannot be empty"));
      }
      updates.siteName = name.slice(0, 60);
    }

    if (tagline !== undefined) {
      updates.tagline = String(tagline).trim().slice(0, 120);
    }

    if (Object.keys(updates).length === 0) {
      return next(createError(400, "Nothing to update"));
    }

    const saved = await ThemeSettings.findOneAndUpdate(
      { key: THEME_KEY },
      { $set: updates, $setOnInsert: { key: THEME_KEY } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // CRITICAL: drop the cached theme so the very next page render picks up
    // the new branding. Without this the storefront would keep serving the old
    // palette for up to THEME_CACHE_TTL.
    await safeDel(THEME_CACHE_KEY);

    return res.status(200).json(
      createSuccess(200, "Theme updated", {
        ...resolveTheme(saved),
        // Single-purpose, 5-minute proof that the frontend's revalidate route
        // may purge its ISR cache. See utils/commonFunctions.js.
        revalidateToken: signThemeRevalidateTicket(req.user),
      })
    );
  } catch (error) {
    next(error);
  }
};

// ── 4. ADMIN: upload a new logo (reuses the existing Cloudinary flow) ──
// Same multer memoryStorage → uploadToCloudinary pipeline the homepage
// banners / categories already use, just a different folder.
export const uploadThemeLogo = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(createError(400, "Logo image file is required"));
    }

    let result;
    try {
      result = await uploadToCloudinary(req.file.buffer, "irhasinn/Theme");
    } catch {
      return next(createError(500, "Logo upload failed"));
    }

    if (!result?.secure_url || !result?.public_id) {
      return next(createError(500, "Logo upload returned incomplete data"));
    }

    const previous = await readTheme();
    const previousPublicId = previous?.logoPublicId || "";

    const saved = await ThemeSettings.findOneAndUpdate(
      { key: THEME_KEY },
      {
        $set: { logoUrl: result.secure_url, logoPublicId: result.public_id },
        $setOnInsert: { key: THEME_KEY },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // Housekeeping: remove the replaced logo from Cloudinary so the media
    // library does not accumulate orphans. Best-effort only — a cleanup
    // failure must never fail the upload the admin just made, and we only
    // ever destroy OUR OWN previous public id.
    if (previousPublicId && previousPublicId !== result.public_id) {
      try {
        await deleteFromCloudinary(previousPublicId);
      } catch (cleanupErr) {
        console.error(
          "[Theme] Old logo cleanup failed:",
          cleanupErr.message || cleanupErr
        );
      }
    }

    await safeDel(THEME_CACHE_KEY);

    return res.status(200).json(
      createSuccess(200, "Logo uploaded", {
        ...resolveTheme(saved),
        revalidateToken: signThemeRevalidateTicket(req.user),
      })
    );
  } catch (error) {
    next(error);
  }
};

// ── 5. ADMIN: remove the custom logo (back to the built-in asset) ──
export const removeThemeLogo = async (req, res, next) => {
  try {
    const previous = await readTheme();
    const previousPublicId = previous?.logoPublicId || "";

    const saved = await ThemeSettings.findOneAndUpdate(
      { key: THEME_KEY },
      {
        $set: { logoUrl: "", logoPublicId: "" },
        $setOnInsert: { key: THEME_KEY },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    if (previousPublicId) {
      try {
        await deleteFromCloudinary(previousPublicId);
      } catch (cleanupErr) {
        console.error(
          "[Theme] Logo cleanup failed:",
          cleanupErr.message || cleanupErr
        );
      }
    }

    await safeDel(THEME_CACHE_KEY);

    return res.status(200).json(
      createSuccess(200, "Logo removed", {
        ...resolveTheme(saved),
        revalidateToken: signThemeRevalidateTicket(req.user),
      })
    );
  } catch (error) {
    next(error);
  }
};

// ── 6. Revalidation ticket check (frontend-only trust boundary) ──
// The storefront's /api/theme/revalidate route holds no signing key, so it
// exchanges the ticket it received from a theme write here for permission to
// purge its ISR cache. Guarded by verifyThemeRevalidateTicket, which rejects
// anything not signed with the dedicated theme-revalidate key.
export const authorizeThemeRevalidate = (req, res) => {
  return res.status(200).json(
    createSuccess(200, "Revalidation authorized", {
      authorized: true,
      scope: req.revalidateTicket?.scope || null,
    })
  );
};
