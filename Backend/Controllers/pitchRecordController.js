import mongoose from "mongoose";
import {
  PitchRecord,
  PITCH_STATUSES,
  PITCH_INTERFACES,
  PITCH_FEATURES,
} from "../Models/PitchRecord.js";
import { BrandProfile } from "../Models/BrandProfile.js";
import { INDUSTRY_PRESET_IDS } from "../utils/showcaseConfig.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";

/* ===========================================================
   CLIENT PITCH & SHOWCASE RECORD CONTROLLER
   -----------------------------------------------------------
   Admin-only sales records for the Jazari Tech Official
   control plane. Follows the standard list/CRUD conventions
   of the existing admin controllers (bounded pagination,
   whitelisted filters, createError/createSuccess envelopes).

   PRIVACY: `internalNotes` / `outcomeNotes` are admin-only by
   virtue of every route in this file sitting behind
   verifyAdmin — there is NO public route for pitch records.

   ARCHIVAL SAFETY: linking a record snapshots the profile's
   name/slug/preset so the record remains understandable even
   if the showcase profile is later archived or renamed.
   =========================================================== */

const clamp = (v, max) => String(v || "").trim().slice(0, max);

/** Strip ObjectId-typed fields that came in as strings. */
const cleanIdList = (value, allowed) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => allowed.includes(v)))].slice(0, 30);
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Latest published version number of a profile, or null when unpublished. */
const latestPublishedVersion = (profile) => {
  const versions = Array.isArray(profile?.versions) ? profile.versions : [];
  return versions.length
    ? versions.map((v) => v.version).sort((a, b) => b - a)[0]
    : null;
};

/**
 * Snapshot a linked profile's identity onto a record. Used on CREATE and on
 * every RE-LINK/save-with-link, so slug/name/industry/version are refreshed
 * from the profile instead of going stale when it is renamed or republished.
 * `selectedPreset` exists only on the record (profiles carry no preset field),
 * so it stays whatever the operator chose.
 */
export const snapshotFromProfile = (profile, fields) => {
  fields.showcaseProfile = profile._id;
  fields.profileNameSnapshot = profile.name;
  fields.profileSlug = profile.slug;
  fields.industry = profile.industry;
  fields.configVersion = latestPublishedVersion(profile);
};

export const toAdminShape = (doc) => ({
  id: String(doc._id),
  clientName: doc.clientName,
  pitchTitle: doc.pitchTitle || "",
  industry: doc.industry,
  status: doc.status,
  showcaseProfile: doc.showcaseProfile ? String(doc.showcaseProfile) : null,
  profileSlug: doc.profileSlug || "",
  profileNameSnapshot: doc.profileNameSnapshot || "",
  selectedPreset: doc.selectedPreset || "",
  configVersion: doc.configVersion ?? null,
  configuredInterfaces: doc.configuredInterfaces || [],
  demonstratedFeatures: doc.demonstratedFeatures || [],
  customizationSummary: doc.customizationSummary || "",
  // PRIVATE — only ever serialized on these authenticated admin endpoints.
  internalNotes: doc.internalNotes || "",
  outcomeNotes: doc.outcomeNotes || "",
  presentedAt: doc.presentedAt || null,
  followUpAt: doc.followUpAt || null,
  createdBy: doc.createdBy ? String(doc.createdBy) : null,
  updatedAt: doc.updatedAt,
  createdAt: doc.createdAt,
});

/* ── input → update object (whitelisted fields only) ────────── */

const buildRecordFields = (body) => {
  const fields = {};
  if (body.clientName !== undefined) {
    const clientName = clamp(body.clientName, 120);
    if (!clientName) throw createError(400, "Client name is required");
    fields.clientName = clientName;
  }
  if (body.pitchTitle !== undefined) fields.pitchTitle = clamp(body.pitchTitle, 140);
  if (body.industry !== undefined) {
    if (!INDUSTRY_PRESET_IDS.includes(body.industry)) {
      throw createError(400, "Unknown industry preset");
    }
    fields.industry = body.industry;
  }
  if (body.status !== undefined) {
    if (!PITCH_STATUSES.includes(body.status)) {
      throw createError(400, "Invalid pitch status");
    }
    fields.status = body.status;
  }
  if (body.configuredInterfaces !== undefined) {
    fields.configuredInterfaces = cleanIdList(body.configuredInterfaces, PITCH_INTERFACES);
  }
  if (body.demonstratedFeatures !== undefined) {
    fields.demonstratedFeatures = cleanIdList(body.demonstratedFeatures, PITCH_FEATURES);
  }
  if (body.customizationSummary !== undefined) {
    fields.customizationSummary = clamp(body.customizationSummary, 2000);
  }
  if (body.internalNotes !== undefined) fields.internalNotes = clamp(body.internalNotes, 4000);
  if (body.outcomeNotes !== undefined) fields.outcomeNotes = clamp(body.outcomeNotes, 2000);
  if (body.presentedAt !== undefined) fields.presentedAt = toDateOrNull(body.presentedAt);
  if (body.followUpAt !== undefined) fields.followUpAt = toDateOrNull(body.followUpAt);
  if (body.selectedPreset !== undefined) fields.selectedPreset = clamp(body.selectedPreset, 40);
  if (body.configVersion !== undefined) {
    const v = parseInt(body.configVersion);
    fields.configVersion = Number.isFinite(v) ? v : null;
  }
  return fields;
};

/* ── list with search / filters / sort / pagination ─────────── */

export const listPitchRecords = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const filter = {};
    if (req.query.status && PITCH_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.industry && INDUSTRY_PRESET_IDS.includes(req.query.industry)) {
      filter.industry = req.query.industry;
    }
    if (req.query.profileId && mongoose.isValidObjectId(req.query.profileId)) {
      filter.showcaseProfile = req.query.profileId;
    }
    if (req.query.q && String(req.query.q).trim()) {
      const q = clamp(req.query.q, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { clientName: { $regex: q, $options: "i" } },
        { pitchTitle: { $regex: q, $options: "i" } },
        { profileSlug: { $regex: q, $options: "i" } },
      ];
    }

    const sort =
      req.query.sort === "oldest"
        ? { createdAt: 1 }
        : req.query.sort === "followUp"
          ? { followUpAt: 1 }
          : { createdAt: -1 };

    const [docs, total, statusCounts] = await Promise.all([
      PitchRecord.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PitchRecord.countDocuments(filter),
      // Lightweight overview counters from REAL data (no fabricated stats),
      // fetched in the SAME round-trip instead of a serial follow-up query.
      PitchRecord.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    const counts = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));

    return res.status(200).json(
      createSuccess(200, "Pitch records fetched", {
        records: docs.map(toAdminShape),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        counts,
      }),
    );
  } catch (error) {
    next(error);
  }
};

export const getPitchRecord = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid record id"));
    }
    const doc = await PitchRecord.findById(req.params.id).lean();
    if (!doc) return next(createError(404, "Pitch record not found"));
    return res.status(200).json(createSuccess(200, "Pitch record fetched", toAdminShape(doc)));
  } catch (error) {
    next(error);
  }
};

export const createPitchRecord = async (req, res, next) => {
  try {
    const fields = buildRecordFields(req.body || {});
    if (!fields.clientName) return next(createError(400, "Client name is required"));

    // Link + snapshot the showcase profile when provided (single query —
    // versions ride along so the published-version reference costs no extra
    // round-trip).
    if (req.body?.showcaseProfileId) {
      if (!mongoose.isValidObjectId(req.body.showcaseProfileId)) {
        return next(createError(400, "Invalid showcase profile id"));
      }
      const profile = await BrandProfile.findById(req.body.showcaseProfileId)
        .select("name slug industry status versions")
        .lean();
      if (!profile) return next(createError(404, "Showcase profile not found"));
      snapshotFromProfile(profile, fields);
    } else if (req.body?.profileSlug !== undefined) {
      fields.profileSlug = clamp(req.body.profileSlug, 80);
    }

    const doc = await PitchRecord.create({
      ...fields,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });

    return res.status(201).json(createSuccess(201, "Pitch record created", toAdminShape(doc.toObject())));
  } catch (error) {
    next(error);
  }
};

export const updatePitchRecord = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid record id"));
    }
    const doc = await PitchRecord.findById(req.params.id);
    if (!doc) return next(createError(404, "Pitch record not found"));

    const fields = buildRecordFields(req.body || {});
    if (req.body?.showcaseProfileId !== undefined) {
      if (!req.body.showcaseProfileId) {
        // Explicit unlink keeps the snapshots for history.
        fields.showcaseProfile = null;
      } else {
        if (!mongoose.isValidObjectId(req.body.showcaseProfileId)) {
          return next(createError(400, "Invalid showcase profile id"));
        }
        const isNewLink =
          String(req.body.showcaseProfileId) !== String(doc.showcaseProfile || "");
        const profile = await BrandProfile.findById(req.body.showcaseProfileId)
          .select("name slug industry status versions")
          .lean();
        if (profile) {
          // Re-link (or plain save) refreshes ALL snapshots — slug, name,
          // industry and published version — from the live profile.
          snapshotFromProfile(profile, fields);
        } else if (isNewLink) {
          // Only a genuinely new link rejects a missing profile; blocking an
          // unrelated edit because an old link's profile was archived would
          // trap the operator with no way to save.
          return next(createError(404, "Showcase profile not found"));
        }
      }
    }

    fields.updatedBy = req.user?.id || null;
    const saved = await PitchRecord.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true, runValidators: true },
    ).lean();

    return res.status(200).json(createSuccess(200, "Pitch record saved", toAdminShape(saved)));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /pitch-records/admin/:id
 * Records are deleted explicitly (not soft-archived) — archiving is a
 * STATUS transition (status=archived) so history stays searchable.
 * Deleting a record never touches its showcase profile.
 */
export const deletePitchRecord = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return next(createError(400, "Invalid record id"));
    }
    const doc = await PitchRecord.findByIdAndDelete(req.params.id).lean();
    if (!doc) return next(createError(404, "Pitch record not found"));
    return res.status(200).json(createSuccess(200, "Pitch record deleted", { id: req.params.id }));
  } catch (error) {
    next(error);
  }
};
