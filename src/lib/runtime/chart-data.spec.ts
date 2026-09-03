import { describe, expect, it } from "vite-plus/test";
import { groupChart, totals } from "./chart-data.ts";

describe("chart data", () => {
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
