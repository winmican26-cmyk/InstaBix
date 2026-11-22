import { describe, expect, it } from "vitest";
import { CREATOR_SORT_KEYS, parseCreatorListParams } from "@/lib/creators/list-params";

function parse(raw: Record<string, string | string[] | undefined>) {
  const result = parseCreatorListParams(raw);
  if (!result.ok) throw new Error(result.error);
  return result.params;
}

describe("parseCreatorListParams", () => {
  it("falls back on unknown sort and direction values", () => {
    expect(parse({ sort: "created_at; drop table creator_accounts--" }).sort).toBe("created");
    expect(parse({}).sort).toBe("created");
    expect(parse({ dir: "sideways" }).dir).toBe("desc");
    expect(parse({}).dir).toBe("desc");
    for (const key of CREATOR_SORT_KEYS) expect(parse({ sort: key }).sort).toBe(key);
    expect(parse({ dir: "asc" }).dir).toBe("asc");
  });

  it("clamps and truncates page numbers", () => {
    const cases: Array<[string, number]> = [
      ["0", 1],
      ["-5", 1],
      ["abc", 1],
      ["", 1],
      ["1.9", 1],
      ["101", 100],
      ["1000", 100],
      ["2", 2],
    ];
    for (const [raw, expected] of cases) expect(parse({ page: raw }).page, raw).toBe(expected);
  });

  it("rejects min > max but accepts equal bounds", () => {
    expect(parseCreatorListParams({ min: "500", max: "100" })).toEqual({
      ok: false,
      error: "Minimum followers cannot exceed maximum followers.",
    });
    expect(parse({ min: "500", max: "500" })).toMatchObject({ minFollowers: 500, maxFollowers: 500 });
  });

  it("drops invalid follower bounds and prefers the first array value", () => {
    expect(parse({ min: "-1", max: "1.9" })).not.toHaveProperty("minFollowers");
    expect(parse({ min: "-1", max: "1.9" })).not.toHaveProperty("maxFollowers");
    expect(parse({ min: "", max: "abc" })).not.toHaveProperty("minFollowers");
    expect(parse({ min: ["10", "999"], max: ["20", "1"] })).toMatchObject({ minFollowers: 10, maxFollowers: 20 });
  });

  it("trims and caps text filters, omitting empty values", () => {
    expect(parse({ q: `  ${"a".repeat(100)}  ` }).q).toBe("a".repeat(80));
    expect(parse({ status: ` ${"s".repeat(60)} ` }).status).toBe("s".repeat(40));
    expect(parse({ source: ` ${"d".repeat(60)} ` }).source).toBe("d".repeat(40));
    expect(parse({ q: "   ", status: "", source: [" ", "manual"] })).toEqual({
      sort: "created",
      dir: "desc",
      page: 1,
    });
    expect(parse({ q: [" first ", "second"] }).q).toBe("first");
  });
});
