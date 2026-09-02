import { describe, expect, it } from "vite-plus/test";
import { cellValue, compareRows, type DataTableColumn } from "./data-table.ts";

describe("data table", () => {
  const amount: DataTableColumn = { id: "amount", label: "Amount", numeric: true };
  const name: DataTableColumn = { id: "name", label: "Name" };

  it("reads cell values and sorts numbers and text", () => {
    expect.hasAssertions();
    const low = { id: "a", name: "Acme", amount: 10 };
    const high = { id: "b", name: "Bright", amount: 80 };
    expect(cellValue(low, amount)).toBe(10);
    expect(compareRows(low, high, amount, "asc")).toBeLessThan(0);
    expect(compareRows(low, high, amount, "desc")).toBeGreaterThan(0);
    expect(compareRows(low, high, name, "asc")).toBeLessThan(0);
  });
});
