import { describe, expect, it } from "vite-plus/test";
import { groupChart, totals } from "./chart-data.ts";
import { viewCellValue } from "$lib/app/view-results.ts";
import type { ViewDraft } from "@jthum/framework/svelte/authoring/data";

describe("chart data", () => {
  it("uses the configured reader for categories, series, values and counts", () => {
    const view: ViewDraft = {
      id: "work",
      key: "work",
      label: "Work",
      source: "task",
      fields: ["project.name", "hours", "status"],
      aliases: { "project.name": ["client", "label"], hours: ["amount", "value"], status: "phase" },
    };
    const rows = [
      { client: { label: "Alpha" }, amount: { value: 7 }, phase: "Open" },
      { client: { label: "Alpha" }, amount: { value: 0 }, phase: "Open" },
      { client: { label: "Beta" }, amount: { value: 3 }, phase: "Closed" },
      { client: { label: "Beta" }, amount: { value: null }, phase: "Closed" },
    ];
    const read = (row: Record<string, unknown>, path: string) => viewCellValue(view, row, path);
    const sums = groupChart(
      rows,
      { category: "project.name", series: "status", value: "hours" },
      read,
    );
    expect(sums.categories.map((item) => item.label)).toEqual(["Alpha", "Beta"]);
    expect(sums.series).toEqual([
      { key: "Open", label: "Open", values: [7, 0] },
      { key: "Closed", label: "Closed", values: [0, 3] },
    ]);
    expect(totals(groupChart(rows, { category: "project.name" }, read))).toEqual([2, 2]);
  });

  it("uses projected dates and skips missing or invalid dates", () => {
    const view: ViewDraft = {
      id: "work",
      key: "work",
      label: "Work",
      source: "task",
      fields: ["when", "hours"],
      aliases: { when: ["timing", "date"], hours: "effort" },
    };
    const chart = groupChart(
      [
        { timing: { date: "2026-01-02" }, effort: 0 },
        { timing: { date: "2026-01-01T12:00:00Z" }, effort: 4 },
        { timing: { date: null }, effort: 10 },
        { timing: { date: "not-a-date" }, effort: 20 },
      ],
      { category: "when", value: "hours", time: true },
      (row, path) => viewCellValue(view, row, path),
    );
    expect(chart.categories.map((item) => item.key)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(totals(chart)).toEqual([4, 0]);
  });
  it("counts and sums by category, and stacks a series", () => {
    expect.hasAssertions();
    const rows = [
      { status: "sent", kind: "design", amount: 10 },
      { status: "sent", kind: "dev", amount: 5 },
      { status: "paid", kind: "design", amount: 20 },
    ];
    const counts = groupChart(rows, { category: "status" });
    expect(counts.categories.map((item) => item.key)).toEqual(["sent", "paid"]);
    expect(counts.series[0]?.values).toEqual([2, 1]);
    const sums = groupChart(rows, { category: "status", value: "amount" });
    expect(sums.series[0]?.values).toEqual([15, 20]);
    const stacked = groupChart(rows, {
      category: "status",
      series: "kind",
      value: "amount",
    });
    expect(stacked.series.map((item) => item.key)).toEqual(["design", "dev"]);
    expect(totals(stacked)).toEqual([15, 20]);
  });

  it("buckets dates by day", () => {
    expect.hasAssertions();
    const rows = [
      { when: "2026-09-01T12:00:00.000Z", hours: 2 },
      { when: "2026-09-01T18:00:00.000Z", hours: 1 },
      { when: "2026-09-02", hours: 4 },
    ];
    const chart = groupChart(rows, { category: "when", value: "hours", time: true });
    expect(chart.categories.map((item) => item.key)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(chart.series[0]?.values).toEqual([3, 4]);
  });
});
