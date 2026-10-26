import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest setup — added for PURE-function unit tests only
 * (Showcase Studio logic: section validation, preset reordering,
 * asset-upload merges, category ordering). No jsdom, no component
 * rendering: the repo's UI verification stays with the Next build,
 * tsc and eslint.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
