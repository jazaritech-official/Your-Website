/**
 * Admin product filter builder tests (F-13).
 *
 * getAdminProducts uses ONE builder result for both find() and
 * countDocuments(), so these tests double as the consistency guarantee:
 * identical input always yields an identical filter, so page rows and
 * "total" counts can never disagree.
 */
import { describe, test, expect } from "@jest/globals";
import {
  escapeRegExp,
  buildAdminProductFilter,
} from "../utils/productFilters.js";

const CAT_ID = "507f1f77bcf86cd799439011";
const SUB_ID = "507f1f77bcf86cd799439012";

describe("escapeRegExp", () => {
  test("escapes regex metacharacters so input matches literally", () => {
    expect(escapeRegExp("a.b(c)")).toBe("a\\.b\\(c\\)");
    expect(escapeRegExp("price*")).toBe("price\\*");
    expect(new RegExp(escapeRegExp("a.b")).test("a.b")).toBe(true);
    expect(new RegExp(escapeRegExp("a.b")).test("axb")).toBe(false);
  });
});

describe("buildAdminProductFilter (F-13)", () => {
  test("empty query yields an empty filter (all products)", () => {
    expect(buildAdminProductFilter({})).toEqual({});
    expect(buildAdminProductFilter()).toEqual({});
  });

  test("category param becomes an exact id match — never a slug", () => {
    const filter = buildAdminProductFilter({ category: CAT_ID });
    expect(filter).toEqual({ category: CAT_ID });
  });

  test("subcategory param becomes an exact id match", () => {
    const filter = buildAdminProductFilter({ subcategory: SUB_ID });
    expect(filter).toEqual({ subcategory: SUB_ID });
  });

  test("subcategory is authoritative when category is also sent (drift rule)", () => {
    // A product's own `category` field can drift from its subcategory's
    // parent (legacy data) — requiring both would silently drop those rows
    // from a subcategory listing, so the subcategory reference wins.
    const filter = buildAdminProductFilter({
      category: CAT_ID,
      subcategory: SUB_ID,
    });
    expect(filter).toEqual({ subcategory: SUB_ID });
    expect(filter.category).toBeUndefined();
  });

  test("search matches name/description/tags with regex escaped", () => {
    const filter = buildAdminProductFilter({ search: "big.tee" });
    expect(filter.$or).toHaveLength(3);
    const [nameCond, descCond, tagsCond] = filter.$or;
    expect(nameCond.name.$regex).toBe("big\\.tee");
    expect(descCond.description.$regex).toBe("big\\.tee");
    expect(tagsCond.tags.$in[0].source).toBe("big\\.tee");
    // literal dot: matches "big.tee", not "bigXtee" — case-insensitive
    // exactly as the controller applies it ($options: "i")
    expect(new RegExp(nameCond.name.$regex, "i").test("bigXtee")).toBe(false);
    expect(new RegExp(nameCond.name.$regex, "i").test("The Big.Tee")).toBe(true);
  });

  test("search + category combine additively", () => {
    const filter = buildAdminProductFilter({
      category: CAT_ID,
      search: "mug",
    });
    expect(filter.category).toBe(CAT_ID);
    expect(filter.$or).toHaveLength(3);
  });

  test("identical input yields deep-equal filters (find/count consistency)", () => {
    const query = { category: CAT_ID, search: "cup", subcategory: "" };
    const a = buildAdminProductFilter(query);
    const b = buildAdminProductFilter(query);
    expect(a).toEqual(b);
    // And the builder never mutates its input — the query object the
    // controller reads afterwards is untouched.
    expect(query).toEqual({ category: CAT_ID, search: "cup", subcategory: "" });
  });

  test("falsy-but-present values are ignored (\"all\" sent as empty)", () => {
    expect(buildAdminProductFilter({ category: "", subcategory: "", search: "" })).toEqual({});
  });
});
