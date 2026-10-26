/**
 * Pitch record tests — PRIVACY + ARCHIVAL-SNAPSHOT regressions.
 *
 * 1. `toAdminShape` is the ONLY shape the pitch endpoints serialize. The
 *    private notes (internalNotes/outcomeNotes) exist solely on these
 *    superadmin routes, so the serializer must always carry them with stable
 *    defaults and must never leak raw document internals (_id, __v).
 * 2. `snapshotFromProfile` is the single link/relink snapshotted path — it
 *    must refresh every archival snapshot field (slug/name/industry/version)
 *    from the live profile so a renamed or republished showcase can never
 *    leave a stale record behind.
 * 3. A static route-table guard: every pitch-records route must stay behind
 *    requireSuperAdmin under /admin. If someone ever mounts a public route,
 *    the private notes would leak — so the route file itself is asserted.
 *
 * `process.env.JWT` is set BEFORE the controller import (it pulls in
 * commonFunctions, which derives signing material at module load).
 */
import { describe, test, expect, beforeAll } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

let toAdminShape;
let snapshotFromProfile;

const TEST_JWT_SECRET = "test-jwt-secret";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
  path.join(__dirname, "../Routes/pitchRecordRoute.js"),
  "utf8",
);

beforeAll(async () => {
  if (!process.env.JWT) process.env.JWT = TEST_JWT_SECRET;
  const mod = await import("../Controllers/pitchRecordController.js");
  toAdminShape = mod.toAdminShape;
  snapshotFromProfile = mod.snapshotFromProfile;
});

describe("toAdminShape — the only serialized pitch shape", () => {
  const doc = {
    _id: "64b000000000000000000001",
    clientName: "Acme",
    pitchTitle: "Renewal",
    industry: "fashion",
    status: "presented",
    showcaseProfile: "64b000000000000000000002",
    profileSlug: "acme-store",
    profileNameSnapshot: "Acme Store",
    selectedPreset: "fashion-modern",
    configVersion: 4,
    configuredInterfaces: ["home"],
    demonstratedFeatures: ["referral"],
    customizationSummary: "X",
    internalNotes: "PRIVATE-internal",
    outcomeNotes: "PRIVATE-outcome",
    presentedAt: new Date("2026-01-01T00:00:00Z"),
    followUpAt: null,
    createdBy: "64b000000000000000000003",
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    __v: 0,
  };

  test("always carries both private notes fields", () => {
    const out = toAdminShape(doc);
    expect(out.internalNotes).toBe("PRIVATE-internal");
    expect(out.outcomeNotes).toBe("PRIVATE-outcome");
  });

  test("keeps an exact key set — no _id/__v/raw document internals", () => {
    const out = toAdminShape(doc);
    expect(Object.keys(out).sort()).toEqual(
      [
        "id",
        "clientName",
        "pitchTitle",
        "industry",
        "status",
        "showcaseProfile",
        "profileSlug",
        "profileNameSnapshot",
        "selectedPreset",
        "configVersion",
        "configuredInterfaces",
        "demonstratedFeatures",
        "customizationSummary",
        "internalNotes",
        "outcomeNotes",
        "presentedAt",
        "followUpAt",
        "createdBy",
        "updatedAt",
        "createdAt",
      ].sort(),
    );
    expect(JSON.stringify(out)).not.toContain("_id");
    expect(JSON.stringify(out)).not.toContain("__v");
  });

  test("missing optional fields serialize as stable defaults, never undefined", () => {
    const out = toAdminShape({
      _id: "64b000000000000000000009",
      clientName: "Solo",
      industry: "general",
      status: "draft",
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    expect(out.id).toBe("64b000000000000000000009");
    expect(out.internalNotes).toBe("");
    expect(out.outcomeNotes).toBe("");
    expect(out.pitchTitle).toBe("");
    expect(out.showcaseProfile).toBeNull();
    expect(out.configVersion).toBeNull();
    expect(out.createdBy).toBeNull();
    expect(out.configuredInterfaces).toEqual([]);
    expect(Object.values(out)).not.toContain(undefined);
  });
});

describe("snapshotFromProfile — create + relink snapshot refresh", () => {
  test("refreshes EVERY archival snapshot field from the live profile", () => {
    const fields = {
      industry: "stale-industry",
      configVersion: 1,
      profileSlug: "old-slug",
      profileNameSnapshot: "Old Name",
    };
    snapshotFromProfile(
      {
        _id: "p1",
        name: "New Name",
        slug: "new-slug",
        industry: "fashion",
        versions: [{ version: 1 }, { version: 3 }, { version: 2 }],
      },
      fields,
    );
    expect(fields).toMatchObject({
      showcaseProfile: "p1",
      profileNameSnapshot: "New Name",
      profileSlug: "new-slug",
      industry: "fashion",
      // Highest published version regardless of array order.
      configVersion: 3,
    });
  });

  test("configVersion is null when the profile has never published", () => {
    const fields = {};
    snapshotFromProfile(
      { _id: "p1", name: "N", slug: "s", industry: "general", versions: [] },
      fields,
    );
    expect(fields.configVersion).toBeNull();
  });

  test("keeps the operator-chosen selectedPreset untouched", () => {
    // Profiles carry no preset field — the preset lives only on the record.
    const fields = { selectedPreset: "manual-choice" };
    snapshotFromProfile(
      { _id: "p1", name: "N", slug: "s", industry: "general" },
      fields,
    );
    expect(fields.selectedPreset).toBe("manual-choice");
  });
});

describe("pitch route table stays superadmin-only", () => {
  const routeLines = routeSource
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^pitchRecordRoute\.(get|post|put|patch|delete)\(/.test(l));

  test("the route table is not empty (guard is meaningful)", () => {
    expect(routeLines.length).toBeGreaterThan(0);
  });

  test("every route is /admin-scoped and behind requireSuperAdmin", () => {
    for (const line of routeLines) {
      expect(line).toMatch(/^pitchRecordRoute\.(get|post|put|patch|delete)\("\/admin/);
      expect(line).toContain("requireSuperAdmin");
    }
  });
});
