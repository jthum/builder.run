import { describe, expect, it } from "vite-plus/test";
import { compactWhere, exposeFilters, matchFilter, normalizeFilters } from "./filters.ts";

describe("view filters", () => {
  it("turns a compact where map into equality clauses", () => {
    expect.hasAssertions();
    expect(normalizeFilters({ status: "sent" })).toEqual([
      { field: "status", op: "eq", value: "sent" },
    ]);
    expect(compactWhere([{ field: "status", op: "eq", value: "sent" }])).toEqual({
      status: "sent",
    });
  });

  it("matches operators including in and contains", () => {
    expect.hasAssertions();
    const row = { status: "sent", title: "Website redesign", amount: 8000 };
    expect(matchFilter(row, { field: "status", op: "in", value: ["sent", "overdue"] })).toBe(true);
    expect(matchFilter(row, { field: "status", op: "neq", value: "paid" })).toBe(true);
    expect(matchFilter(row, { field: "title", op: "contains", value: "web" })).toBe(true);
    expect(matchFilter(row, { field: "amount", op: "gte", value: 8000 })).toBe(true);
    expect(matchFilter(row, { field: "notes", op: "empty" })).toBe(true);
  });

  it("builds extra clauses from exposed values", () => {
    expect.hasAssertions();
    expect(exposeFilters(["status"], { status: "paid" })).toEqual([
      { field: "status", op: "eq", value: "paid" },
    ]);
    expect(exposeFilters(["status"], { status: "" })).toEqual([]);
  });
});
