import { describe, expect, it } from "vite-plus/test";
import { scalarEqual, scalarString } from "./values.ts";

describe("dynamic scalar values", () => {
  it("preserves scalar text without default object stringification", () => {
    expect(scalarString(null)).toBe("");
    expect(scalarString(false)).toBe("false");
    expect(scalarString(42)).toBe("42");
    expect(scalarString({ score: 5 })).toBe('{"score":5}');
  });

  it("compares dynamic values through the same representation", () => {
    expect(scalarEqual(5, "5")).toBe(true);
    expect(scalarEqual({ score: 5 }, { score: 5 })).toBe(true);
    expect(scalarEqual({ score: 5 }, { score: 4 })).toBe(false);
  });
});
