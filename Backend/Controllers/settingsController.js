import { Settings } from "../Models/Settings.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { safeGet, safeSet, safeDel } from "../utils/redisCache.js";

/* ===========================================================
   STORE SETTINGS CONTROLLER
   The storefront reads the PUBLIC shape (threshold + toggle)
   from an unauthenticated endpoint so guests see the progress
   bar on the cart/checkout pages. Admins read/update the same
   knobs through the admin endpoints.
   =========================================================== */

const SETTINGS_KEY = "store";

// ── Redis cache-aside for the public settings shape ──
// Settings change rarely and are read on every cart/checkout page load,
// so the reads are cached. Any Redis issue falls back to the direct DB
// read (safeGet returns null → normal path). Invalidation: updateSettings
// deletes the key immediately after a successful save (see below) so a
// customer can never see a stale threshold for up to CACHE_TTL.
const SETTINGS_CACHE_KEY = "app:settings";
const SETTINGS_CACHE_TTL = 300; // 5 minutes

/** Read the settings doc, creating the singleton on first use. */
const readSettings = async () => {
  return Settings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $setOnInsert: { key: SETTINGS_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
};

/** Shape exposed to the public storefront (no admin internals). */
const publicShape = (doc) => ({
  freeShippingThreshold: doc.freeShippingThreshold ?? 2000,
  freeShippingProgressBarEnabled: doc.freeShippingProgressBarEnabled ?? true,
  shippingFee: doc.shippingFee ?? 0,
  cityShipping: Array.isArray(doc.cityShipping) ? doc.cityShipping : [],
  cityShippingEnabled: doc.cityShippingEnabled === true,
});

// ── 1. PUBLIC: storefront settings (cart / checkout progress bar) ──
export const getPublicSettings = async (req, res, next) => {
  try {
    const cached = await safeGet(SETTINGS_CACHE_KEY);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Store settings fetched", cached));
    }
    const doc = await readSettings();
    const payload = publicShape(doc);
    await safeSet(SETTINGS_CACHE_KEY, payload, SETTINGS_CACHE_TTL);
    return res
      .status(200)
      .json(createSuccess(200, "Store settings fetched", payload));
  } catch (error) {
    next(error);
  }
};

// ── 2. ADMIN: full settings ──
// Same public shape as the storefront read, so both share one cache key.
export const getSettingsAdmin = async (req, res, next) => {
  try {
    const cached = await safeGet(SETTINGS_CACHE_KEY);
    if (cached) {
      return res
        .status(200)
        .json(createSuccess(200, "Store settings fetched", cached));
    }
    const doc = await readSettings();
    const payload = publicShape(doc);
    await safeSet(SETTINGS_CACHE_KEY, payload, SETTINGS_CACHE_TTL);
    return res
      .status(200)
      .json(createSuccess(200, "Store settings fetched", payload));
  } catch (error) {
    next(error);
  }
};

// ── 3. ADMIN: update the free-shipping knobs ──
// Only the whitelisted fields are accepted — everything else in the
// request body is ignored, so a client can never write arbitrary settings.
export const updateSettings = async (req, res, next) => {
  try {
    const updates = {};
    const {
      freeShippingThreshold,
      freeShippingProgressBarEnabled,
      shippingFee,
      cityShipping,
      cityShippingEnabled,
    } = req.body || {};

    if (freeShippingThreshold !== undefined) {
      const threshold = Number(freeShippingThreshold);
      if (Number.isNaN(threshold) || threshold < 0) {
        return next(
          createError(400, "Free shipping threshold must be a non-negative number")
        );
      }
      updates.freeShippingThreshold = Math.round(threshold);
    }

    if (freeShippingProgressBarEnabled !== undefined) {
      updates.freeShippingProgressBarEnabled =
        freeShippingProgressBarEnabled === true ||
        freeShippingProgressBarEnabled === "true";
    }

    if (shippingFee !== undefined) {
      const fee = Number(shippingFee);
      if (Number.isNaN(fee) || fee < 0) {
        return next(
          createError(400, "Base shipping fee must be a non-negative number")
        );
      }
      updates.shippingFee = Math.round(fee);
    }

    if (cityShippingEnabled !== undefined) {
      updates.cityShippingEnabled = cityShippingEnabled === true || cityShippingEnabled === "true";
    }

    if (cityShipping !== undefined) {
      if (!Array.isArray(cityShipping)) {
        return next(createError(400, "cityShipping must be an array"));
      }
      // Normalize and validate each entry
      const normalized = [];
      for (const entry of cityShipping) {
        const cityName = (entry?.city || "").trim().toLowerCase();
        const charge = Number(entry?.charge);
        if (!cityName) continue;
        if (Number.isNaN(charge) || charge < 0) continue;
        normalized.push({
          city: cityName,
          charge: Math.round(charge),
          enabled: entry?.enabled !== false,
          isDefault: entry?.isDefault === true,
        });
      }
      // Enforce: at most one entry can be marked as default
      const defaultEntries = normalized.filter((e) => e.isDefault);
      if (defaultEntries.length > 1) {
        // Keep only the first default, clear the rest
        let foundFirst = false;
        for (const entry of normalized) {
          if (entry.isDefault) {
            if (foundFirst) entry.isDefault = false;
            else foundFirst = true;
          }
        }
      }
      updates.cityShipping = normalized;
    }

    if (Object.keys(updates).length === 0) {
      return next(createError(400, "Nothing to update"));
    }

    const saved = await Settings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $set: updates, $setOnInsert: { key: SETTINGS_KEY } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // CRITICAL cache invalidation: delete the cached settings so the
    // storefront picks up the change immediately. A missed invalidation
    // would serve stale values (e.g. the old free-shipping threshold) to
    // customers for up to SETTINGS_CACHE_TTL minutes.
    await safeDel(SETTINGS_CACHE_KEY);

    return res
      .status(200)
      .json(createSuccess(200, "Store settings updated", publicShape(saved)));
  } catch (error) {
    next(error);
  }
};
