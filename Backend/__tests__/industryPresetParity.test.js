/**
 * Industry preset id parity test (F-06 / F-10).
 *
 * Three places carry the industry preset id list:
 *   1. shared/industryPresetIds.json          (canonical contract)
 *   2. Backend/utils/showcaseConfig.js        (INDUSTRY_PRESET_IDS — the
 *      validation registry every API write goes through)
 *   3. Frontend/src/config/industryPresets.ts (INDUSTRY_PRESETS objects the
 *      Studio create-modal and editor offer — id derived from p.id)
 *
 * This test parses the FRONTEND SOURCE from disk and the canonical JSON and
 * compares all three. It MUST FAIL if any list drifts — that is its whole
 * job (an unknown-but-offered id means the backend 400s a form the UI let
 * the operator fill in; a backend-only id means a preset nobody can pick).
 *
 * Runs with plain fs — no frontend build or import needed.
 */
import { describe, test, expect } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { INDUSTRY_PRESET_IDS } from "../utils/showcaseConfig.js";

// npm test runs with cwd = Backend/ (the package root).
const JSON_PATH = path.resolve(process.cwd(), "..", "shared", "industryPresetIds.json");
const FRONTEND_PRESETS_PATH = path.resolve(
  process.cwd(),
  "..",
  "Frontend",
  "src",
  "config",
  "industryPresets.ts",
);

const readCanonicalIds = () => {
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  expect(Array.isArray(raw.ids)).toBe(true);
  return raw.ids;
};

/** Extract `id: "..."` string literals from the frontend preset library. */
const readFrontendIds = () => {
  const source = fs.readFileSync(FRONTEND_PRESETS_PATH, "utf8");
  const ids = [];
  const re = /\bid:\s*"([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(source)) !== null) ids.push(m[1]);
  return ids;
};

describe("industry preset id parity (F-06/F-10)", () => {
  test("canonical JSON has unique, url-safe ids", () => {
    const ids = readCanonicalIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  test("backend INDUSTRY_PRESET_IDS matches the canonical JSON exactly", () => {
    expect([...INDUSTRY_PRESET_IDS]).toEqual(readCanonicalIds());
  });

  test("frontend INDUSTRY_PRESETS ids match the canonical JSON (same set)", () => {
    const frontendIds = readFrontendIds();
    const canonical = readCanonicalIds();
    // Unique + identical membership in both directions. If someone adds a
    // preset object with a new id (or a stray id literal appears), or adds a
    // canonical id without a preset object, this fails.
    expect(new Set(frontendIds).size).toBe(frontendIds.length);
    expect([...frontendIds].sort()).toEqual([...canonical].sort());
  });

  test("frontend library covers every backend-valid id (create-modal offer)", () => {
    const frontendIds = new Set(readFrontendIds());
    for (const id of INDUSTRY_PRESET_IDS) {
      expect(frontendIds.has(id)).toBe(true);
    }
  });
});
