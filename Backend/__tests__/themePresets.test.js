/**
 * Palette preset integrity tests.
 *
 * The risk this guards: a palette that is missing a token would leave that
 * token on the admin's PREVIOUS value, silently producing an incoherent mix
 * (e.g. the new palette's gold with the old palette's navy). These tests make
 * that impossible to ship.
 */
import { describe, test, expect } from "@jest/globals";
import {
  THEME_PRESETS,
  THEME_PRESET_IDS,
  findThemePreset,
} from "../utils/themePresets.js";
import {
  THEME_COLOR_KEYS,
  isValidHexColor,
  THEME_TOKEN_REGISTRY,
} from "../utils/themeDefaults.js";

describe("theme presets — completeness contract", () => {
  test("the curated set is a reasonable size (6–10 palettes)", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(THEME_PRESETS.length).toBeLessThanOrEqual(10);
  });

  test("ids and names are unique", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    const names = THEME_PRESETS.map((p) => p.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    expect(THEME_PRESET_IDS).toEqual(ids);
  });

  test.each(THEME_PRESETS.map((p) => [p.id, p]))(
    "'%s' defines EVERY registered token",
    (_id, preset) => {
      for (const key of THEME_COLOR_KEYS) {
        expect(preset.colors[key]).toBeDefined();
      }
      // …and nothing beyond the registry (a typo'd key would be dropped by
      // Mongoose strict mode and silently do nothing).
      expect(Object.keys(preset.colors).sort()).toEqual(
        [...THEME_COLOR_KEYS].sort(),
      );
    },
  );

  test.each(THEME_PRESETS.map((p) => [p.id, p]))(
    "'%s' uses only valid hex colours",
    (_id, preset) => {
      for (const [key, value] of Object.entries(preset.colors)) {
        expect({ token: key, valid: isValidHexColor(value) }).toEqual({
          token: key,
          valid: true,
        });
      }
    },
  );

  test("every preset has a name and a description for the Admin UI", () => {
    for (const preset of THEME_PRESETS) {
      expect(typeof preset.name).toBe("string");
      expect(preset.name.length).toBeGreaterThan(0);
      expect(typeof preset.description).toBe("string");
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  test("the default preset matches the compiled Tailwind defaults exactly", () => {
    // Guarantees the "Irhas Classic" swatch reflects the store's true
    // out-of-the-box appearance (globals.css @theme values).
    const classic = findThemePreset("irhas-classic");
    expect(classic).not.toBeNull();
    const compiled = {
      brandNavy: "#222831",
      brandNavyDeep: "#1B2027",
      brandNavySoft: "#3B4257",
      brandGold: "#C8A84E",
      brandGoldStrong: "#C9A227",
      brandGoldHover: "#B8943F",
      surfaceCard: "#FFFFFF",
      surfacePage: "#F7F8FA",
      surfaceMuted: "#F1F5F9",
      line: "#E5E7EB",
      lineSoft: "#F1F3F5",
      ink: "#111827",
      inkMuted: "#6B7280",
      inkSubtle: "#9CA3AF",
    };
    for (const [key, value] of Object.entries(compiled)) {
      expect(classic.colors[key]).toBe(value);
    }
  });
});

describe("theme presets — design guarantees", () => {
  test("semantic colours are identical in every palette", () => {
    // Status signals must read the same regardless of brand palette.
    const semanticKeys = [
      "stateSuccess",
      "stateWarning",
      "stateDanger",
      "stateInfo",
    ];
    const first = THEME_PRESETS[0].colors;
    for (const preset of THEME_PRESETS) {
      for (const key of semanticKeys) {
        expect(preset.colors[key]).toBe(first[key]);
      }
    }
  });

  test("body text keeps strong contrast against the card surface", () => {
    // Guards against shipping an unreadable palette: relative luminance of
    // `ink` vs `surfaceCard` must stay well above the WCAG AA 4.5:1 minimum.
    const luminance = (hex) => {
      const clean = hex.replace("#", "");
      const rgb = [0, 2, 4].map((i) =>
        parseInt(clean.slice(i, i + 2), 16) / 255,
      );
      const [r, g, b] = rgb.map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const preset of THEME_PRESETS) {
      const r = ratio(preset.colors.ink, preset.colors.surfaceCard);
      expect({ palette: preset.id, ok: r >= 7 }).toEqual({
        palette: preset.id,
        ok: true,
      });
    }
  });

  /*
   * The accent is used primarily ON the dark brand surface (footers, dark
   * header bars, gold-on-navy buttons), so that is the pairing worth
   * enforcing. Deliberately NOT asserting accent-on-white: the store's
   * existing default gold (#C8A84E) is only ~2.2:1 against white — normal for
   * a mustard accent — and the default palette must stay byte-identical to
   * today's live design, so the palette is not the thing to change.
   */
  test("accent is clearly visible on the dark brand surface (≥ 3:1)", () => {
    const relative = (hex) => {
      const clean = hex.replace("#", "");
      const rgb = [0, 2, 4].map((i) =>
        parseInt(clean.slice(i, i + 2), 16) / 255,
      );
      const [r, g, b] = rgb.map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [hi, lo] = [relative(a), relative(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const preset of THEME_PRESETS) {
      const r = ratio(preset.colors.brandGold, preset.colors.brandNavy);
      expect({ palette: preset.id, ok: r >= 3 }).toEqual({
        palette: preset.id,
        ok: true,
      });
    }
  });

  test("the accent is never accidentally identical to a surface or the body text", () => {
    for (const preset of THEME_PRESETS) {
      const accent = preset.colors.brandGold.toLowerCase();
      expect({ palette: preset.id, ok: accent !== preset.colors.surfaceCard.toLowerCase() }).toEqual({
        palette: preset.id,
        ok: true,
      });
      expect({ palette: preset.id, ok: accent !== preset.colors.ink.toLowerCase() }).toEqual({
        palette: preset.id,
        ok: true,
      });
    }
  });

  test("the accent is dark enough to carry deep text on it", () => {
    // brandNavyDeep is the label colour inside accent-coloured buttons.
    for (const preset of THEME_PRESETS) {
      const deep = preset.colors.brandNavyDeep;
      const accent = preset.colors.brandGold;
      const hex = deep.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      // Deep must stay dark (not a light tint) so it reads on a bright accent.
      expect({ palette: preset.id, dark: r + g + b < 300 }).toEqual({
        palette: preset.id,
        dark: true,
      });
      expect(accent).not.toBe(deep);
    }
  });
});

describe("theme registry sanity for presets", () => {
  test("every registry token is a colour (so presets can populate it)", () => {
    for (const token of THEME_TOKEN_REGISTRY) {
      expect(token.cssVar).toMatch(/^--color-/);
    }
  });
});
