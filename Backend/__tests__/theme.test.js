/**
 * Theme registry integrity tests.
 *
 * These guard the one failure mode this feature is actually prone to: the
 * token registry (`utils/themeDefaults.js`) and the Mongoose schema
 * (`Models/ThemeSettings.js`) drifting apart. Mongoose runs `strict: true`, so a
 * registered token with no declared schema path is silently DROPPED on save —
 * the Admin picks a colour, gets a success response, and the value vanishes on
 * the next read with no error anywhere. The schema is now built FROM the
 * registry, and the test below fails loudly if that ever stops being true.
 *
 * No DB connection is required — schema inspection is purely structural.
 */
import { describe, test, expect } from "@jest/globals";
import {
  THEME_TOKEN_REGISTRY,
  THEME_COLOR_KEYS,
  DEFAULT_THEME_COLORS,
  DEFAULT_BRANDING,
  isValidHexColor,
} from "../utils/themeDefaults.js";
import { ThemeSettings } from "../Models/ThemeSettings.js";

describe("Theme token registry", () => {
  test("every token has the fields the frontend + admin UI rely on", () => {
    for (const token of THEME_TOKEN_REGISTRY) {
      expect(typeof token.apiKey).toBe("string");
      expect(token.apiKey.length).toBeGreaterThan(0);
      expect(token.cssVar).toMatch(/^--color-[a-z0-9-]+$/);
      expect(typeof token.label).toBe("string");
      expect(typeof token.group).toBe("string");
      expect(isValidHexColor(token.default)).toBe(true);
    }
  });

  test("apiKeys and cssVars are unique (no two tokens fighting over one variable)", () => {
    const keys = THEME_TOKEN_REGISTRY.map((t) => t.apiKey);
    const vars = THEME_TOKEN_REGISTRY.map((t) => t.cssVar);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(vars).size).toBe(vars.length);
  });

  test("THEME_COLOR_KEYS and DEFAULT_THEME_COLORS stay in sync with the registry", () => {
    expect(THEME_COLOR_KEYS).toHaveLength(THEME_TOKEN_REGISTRY.length);
    expect(Object.keys(DEFAULT_THEME_COLORS)).toHaveLength(
      THEME_TOKEN_REGISTRY.length,
    );
    for (const token of THEME_TOKEN_REGISTRY) {
      expect(THEME_COLOR_KEYS).toContain(token.apiKey);
      expect(DEFAULT_THEME_COLORS[token.apiKey]).toBe(token.default);
    }
  });

  test("branding defaults are present and non-empty", () => {
    expect(typeof DEFAULT_BRANDING.siteName).toBe("string");
    expect(DEFAULT_BRANDING.siteName.length).toBeGreaterThan(0);
    expect(typeof DEFAULT_BRANDING.tagline).toBe("string");
    // Empty logo means "fall back to the built-in asset" — see resolveLogoUrl().
    expect(DEFAULT_BRANDING.logoUrl).toBe("");
  });
});

describe("ThemeSettings schema — registry drift guard", () => {
  /**
   * THE important test: a registered token MUST be a declared schema path or
   * `strict: true` silently discards it on save.
   */
  test("every registered token is a declared schema path", () => {
    const declared = Object.keys(ThemeSettings.schema.paths);
    for (const token of THEME_TOKEN_REGISTRY) {
      expect(declared).toContain(`colors.${token.apiKey}`);
    }
  });

  test("a new document is populated with every registry default", () => {
    const doc = new ThemeSettings({});
    for (const token of THEME_TOKEN_REGISTRY) {
      expect(doc.get(`colors.${token.apiKey}`)).toBe(token.default);
    }
  });

  test("a colour outside the registry is rejected by strict mode, not silently kept", () => {
    // Guards the inverse mistake: exposing a token in the UI that the schema
    // cannot persist.
    const doc = new ThemeSettings({ colors: { notARealToken: "#123456" } });
    expect(doc.get("colors.notARealToken")).toBeUndefined();
  });
});

describe("Hex colour validation", () => {
  test.each([
    ["#fff", true],
    ["#FFFFFF", true],
    ["#c8a84e", true],
    ["#11223344", true],
    ["  #ABCDEF  ", true], // trimmed before validation
  ])("accepts %s", (value, expected) => {
    expect(isValidHexColor(value)).toBe(expected);
  });

  test.each([
    ["#fff0"],
    ["fff"],
    ["red"],
    ["rgb(1,2,3)"],
    ["#GGGGGG"],
    ["#12345"],
    ["javascript:alert(1)"],
    [""],
    [null],
    [undefined],
    [123],
    ["#fff;--x:1"],
  ])("rejects %s", (value) => {
    expect(isValidHexColor(value)).toBe(false);
  });

  test("rejects a value that would inject a second declaration", () => {
    // Defence in depth: the same string is interpolated into a <style> block.
    const payload = "#FFFFFF;--color-brand-navy:#000000";
    expect(isValidHexColor(payload)).toBe(false);
  });
});
