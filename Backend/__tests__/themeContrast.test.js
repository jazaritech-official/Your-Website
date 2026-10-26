/**
 * Semantic status token contrast tests (F-11).
 *
 * Decision: the four semantic tokens (success/warning/danger/info) are
 * EXPOSED in the theme editor, with an accessible-contrast floor — every
 * value must keep at least 3:1 contrast against white (WCAG 1.4.11), which
 * every default and preset token passes. The same rule is enforced by
 * updateTheme (400) and by the showcase sanitizer (drop + INVALID_VALUE
 * warning), and mirrored client-side in the Appearance editor.
 */
import { describe, test, expect } from "@jest/globals";
import {
  SEMANTIC_COLOR_KEYS,
  SEMANTIC_CONTRAST_MIN,
  contrastRatio,
  meetsSemanticContrast,
  isValidHexColor,
  DEFAULT_THEME_COLORS,
} from "../utils/themeDefaults.js";
import { sanitizeShowcaseConfig } from "../utils/showcaseConfig.js";
import { THEME_PRESETS } from "../utils/themePresets.js";

describe("contrast math", () => {
  test("black vs white is 21:1, identical colours are 1:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  test("shorthand hex is expanded correctly", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
  });

  test("unparsable input degrades to 1 (never masks a bad value)", () => {
    expect(contrastRatio("not-a-color", "#FFFFFF")).toBe(1);
  });
});

describe("semantic token registry", () => {
  test("exactly the four status tokens are covered", () => {
    expect([...SEMANTIC_COLOR_KEYS].sort()).toEqual(
      ["stateDanger", "stateInfo", "stateSuccess", "stateWarning"].sort(),
    );
    expect(SEMANTIC_CONTRAST_MIN).toBe(3);
  });

  test("every DEFAULT semantic token passes the floor", () => {
    for (const key of SEMANTIC_COLOR_KEYS) {
      expect(isValidHexColor(DEFAULT_THEME_COLORS[key])).toBe(true);
      expect(meetsSemanticContrast(DEFAULT_THEME_COLORS[key])).toBe(true);
    }
  });

  test("every built-in theme preset's semantic tokens pass the floor", () => {
    expect(THEME_PRESETS.length).toBeGreaterThan(0);
    let checked = 0;
    for (const preset of THEME_PRESETS) {
      for (const key of SEMANTIC_COLOR_KEYS) {
        const value = preset.colors?.[key];
        // completeness contract + accessibility floor in one assertion each
        expect(typeof value).toBe("string");
        expect(meetsSemanticContrast(value)).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBe(THEME_PRESETS.length * SEMANTIC_COLOR_KEYS.length);
  });

  test("pale re-tints fail the floor", () => {
    expect(meetsSemanticContrast("#FEF3C7")).toBe(false); // amber-100
    expect(meetsSemanticContrast("#BBF7D0")).toBe(false); // green-100
    expect(meetsSemanticContrast("#16A34A")).toBe(true); // default success
  });
});

describe("showcase sanitizer applies the floor (F-11)", () => {
  test("a low-contrast semantic token is dropped with an INVALID_VALUE warning", () => {
    const { value, errors, warnings } = sanitizeShowcaseConfig({
      brandName: "X",
      theme: { colors: { stateSuccess: "#FEF3C7" } },
    });
    expect(value.theme.colors.stateSuccess).toBeUndefined();
    expect(errors.some((e) => e.includes("stateSuccess"))).toBe(true);
    expect(
      warnings.some(
        (w) => w.code === "INVALID_VALUE" && w.path === "theme.colors.stateSuccess",
      ),
    ).toBe(true);
  });

  test("an accessible semantic token is kept", () => {
    const { value, ok } = sanitizeShowcaseConfig({
      brandName: "X",
      theme: { colors: { stateInfo: "#2563EB" } },
    });
    expect(ok).toBe(true);
    expect(value.theme.colors.stateInfo).toBe("#2563EB");
  });

  test("non-semantic brand tokens are NOT contrast-limited (brand freedom)", () => {
    // A pale brand accent is a legitimate design choice — only the four
    // functional signals carry the accessibility floor.
    const { value, ok } = sanitizeShowcaseConfig({
      brandName: "X",
      theme: { colors: { brandGold: "#FDE68A" } },
    });
    expect(ok).toBe(true);
    expect(value.theme.colors.brandGold).toBe("#FDE68A");
  });
});
