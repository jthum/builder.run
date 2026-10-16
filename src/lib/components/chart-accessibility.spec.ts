import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { render } from "svelte/server";
import { loadBlock, loadBlockPreview } from "$lib/blocks/registry.ts";
import Charts from "../../testing/chart-accessibility-fixture.svelte";
import ChartFrame from "./chart-frame.svelte";
import ChartMark from "./chart-mark.svelte";
import ChartPattern from "./chart-pattern.svelte";
import { ChartInteraction } from "$lib/runtime/chart-interaction.svelte.ts";

vi.mock("$lib/components/chart-plot.svelte", async () => ({
  default: (await import("../../testing/chart-plot-fixture.svelte")).default,
}));
vi.mock("$lib/app/session.svelte.ts", () => ({ session: { accent: "blue" } }));

const keys = ["bar", "line", "stacked_bar", "donut", "scatter", "funnel", "heatmap"] as const;
beforeAll(async () => {
  await Promise.all(keys.map((key) => loadBlock(key)));
}, 30_000);

describe("accessible SVG charts", () => {
  it.each([0, 1, 2, 3, 4, 5])("keeps pattern %s subtle, including filled dots", (index) => {
    const html = render(ChartPattern, {
      props: { id: `pattern-${index}`, index, color: "var(--primary)" },
    }).body;
    expect(html).toMatch(/<g[^>]+opacity="0.24"/);
    expect(html).toContain('stroke-width="0.75"');
    expect(html).not.toContain("stroke-opacity=");
    if (index === 1) expect(html).toContain('r="0.85"');
  });

  it.each(keys)("exposes a labelled keyboard plot and on-demand data in %s", async (key) => {
    const preview = (await loadBlockPreview(key))!;
    const Component = (await loadBlock(key))!;
    const html = render(Component, {
      props: { ...preview, rows: preview.rows ?? {}, ready: true },
    }).body;
    expect(html).toMatch(/<svg[^>]+role="group"/);
    expect(html).toContain("data-chart-plot");
    expect(html).toContain("aria-describedby=");
    expect(html).toMatch(/<desc[^>]*>[^<]*arrow keys/i);
    expect(html).toContain("View chart data");
    expect(html).not.toContain("<table");
    const marks = html.match(/<(?:rect|circle|path)[^>]*data-chart-item[^>]*>/g) ?? [];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.filter((mark) => /tabindex="0"/.test(mark))).toHaveLength(1);
    expect(marks.every((mark) => /aria-label="[^"]+"/.test(mark))).toBe(true);
    expect(marks.every((mark) => /role="img"/.test(mark))).toBe(true);
    expect(html).not.toContain('role="presentation"');
  });

  it("uses unique pattern IDs across charts and swatches, with no dangling pattern fills", () => {
    const html = render(Charts).body;
    const ids = [...html.matchAll(/<pattern\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]!);
    const fills = [...html.matchAll(/url\(#([^)]*)\)/g)].map((match) => match[1]!);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fills.every((id) => ids.includes(id))).toBe(true);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
  });

  it("renders stable toggle names and keeps hidden legend controls available", () => {
    const interaction = new ChartInteraction();
    interaction.hidden = new Set(["Open", "Done"]);
    const html = render(ChartFrame, {
      props: {
        title: "Work",
        interaction,
        hidden: interaction.hidden,
        onToggle: (key) => interaction.toggle(key),
        legend: [
          { key: "Open", label: "Open", color: "red", index: 0 },
          { key: "Done", label: "Done", color: "blue", index: 1 },
        ],
      },
    }).body;
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Open"');
    expect(html).toContain('aria-label="Done"');
    expect(html).not.toContain("Nothing to chart yet");
  });

  it("uses distinct dash styles for multiple line series", () => {
    const html = render(ChartMark, {
      props: {
        mark: "line",
        title: "Hours by team",
        category: "when",
        series: "team",
        value: "hours",
        view: {
          id: "work",
          key: "work",
          label: "Work",
          source: "task",
          fields: ["when", "team", "hours"],
        },
        rows: [
          { when: "2026-01-01", team: "Design", hours: 3 },
          { when: "2026-01-01", team: "Engineering", hours: 7 },
        ],
      },
    }).body;
    expect(html.match(/stroke-dasharray="8 3"/g)).toHaveLength(2);
    expect(html).toContain("Design");
    expect(html).toContain("Engineering");
    expect(html).toContain('aria-label="2026-01-01 · Engineering: 7"');
  });
});
