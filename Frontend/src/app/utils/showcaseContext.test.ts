/**
 * Persisted showcase-context tests (F-context).
 *
 * The active showcase slug survives refresh via localStorage — these tests
 * pin the EXPIRY contract (24h), the legacy-format migration, the invalid
 * payload cleanup and Exit clearing.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  SHOWCASE_CONTEXT_TTL_MS,
  isOverrideExcluded,
  readActiveShowcaseSlug,
  writeActiveShowcaseSlug,
} from "./showcase";

// The helpers check `typeof window` at CALL time, so stubbing after import
// is safe.
const store = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const LS_KEY = "jazari:activeShowcase";

beforeEach(() => {
  store.clear();
});

describe("override route exclusion (F-context)", () => {
  test("admin, OTP and rider routes never take a showcase override", () => {
    expect(isOverrideExcluded("/Admin")).toBe(true);
    expect(isOverrideExcluded("/Admin/ShowcaseStudio/abc")).toBe(true);
    expect(isOverrideExcluded("/otpPage")).toBe(true);
    expect(isOverrideExcluded("/rider/dashboard")).toBe(true);
  });

  test("customer and store routes are allowed", () => {
    expect(isOverrideExcluded("/")).toBe(false);
    expect(isOverrideExcluded("/store/anzara-studio")).toBe(false);
    expect(isOverrideExcluded("/productsPage")).toBe(false);
    expect(isOverrideExcluded("/checkout")).toBe(false);
    expect(isOverrideExcluded(null)).toBe(false);
  });

  test("prefix matching does not over-match (no bare string prefix bugs)", () => {
    expect(isOverrideExcluded("/Adminish")).toBe(false);
    expect(isOverrideExcluded("/otpPageOther")).toBe(false);
  });
});

describe("showcase context persistence (F-context)", () => {
  test("fresh session has no active showcase", () => {
    expect(readActiveShowcaseSlug()).toBeNull();
  });

  test("write → read round-trips the slug", () => {
    writeActiveShowcaseSlug("anzara-studio");
    expect(readActiveShowcaseSlug()).toBe("anzara-studio");
  });

  test("Exit (write null) clears the persisted context", () => {
    writeActiveShowcaseSlug("anzara-studio");
    writeActiveShowcaseSlug(null);
    expect(readActiveShowcaseSlug()).toBeNull();
    expect(store.has(LS_KEY)).toBe(false);
  });

  test("context expires after the TTL", () => {
    writeActiveShowcaseSlug("anzara-studio");
    const raw = JSON.parse(store.get(LS_KEY) as string) as { slug: string; ts: number };
    expect(raw.slug).toBe("anzara-studio");
    // Age the stamp past the TTL.
    store.set(LS_KEY, JSON.stringify({ ...raw, ts: Date.now() - SHOWCASE_CONTEXT_TTL_MS - 1000 }));
    expect(readActiveShowcaseSlug()).toBeNull();
    // and the stale value cleans itself up
    expect(store.has(LS_KEY)).toBe(false);
  });

  test("context within the TTL stays active", () => {
    store.set(
      LS_KEY,
      JSON.stringify({ slug: "anzara-studio", ts: Date.now() - 1000 }),
    );
    expect(readActiveShowcaseSlug()).toBe("anzara-studio");
  });

  test("legacy bare-slug values are migrated to a stamped record", () => {
    store.set(LS_KEY, "anzara-studio");
    expect(readActiveShowcaseSlug()).toBe("anzara-studio");
    const migrated = JSON.parse(store.get(LS_KEY) as string) as { slug: string; ts: number };
    expect(migrated.slug).toBe("anzara-studio");
    expect(typeof migrated.ts).toBe("number");
  });

  test("invalid slugs / garbage payloads are cleared, never trusted", () => {
    store.set(LS_KEY, JSON.stringify({ slug: "<script>x</script>", ts: Date.now() }));
    expect(readActiveShowcaseSlug()).toBeNull();
    expect(store.has(LS_KEY)).toBe(false);

    store.set(LS_KEY, "{not json");
    expect(readActiveShowcaseSlug()).toBeNull();
    expect(store.has(LS_KEY)).toBe(false);

    // A hand-edited payload without a stamp is treated as invalid (fail
    // closed to the default identity), not as "never expires".
    store.set(LS_KEY, JSON.stringify({ slug: "anzara-studio" }));
    expect(readActiveShowcaseSlug()).toBeNull();
    expect(store.has(LS_KEY)).toBe(false);
  });
});
