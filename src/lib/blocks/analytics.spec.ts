import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { render } from "svelte/server";
import type { ViewDraft } from "@jthum/framework/svelte/authoring/data";
import type { BlockProps } from "./types.ts";
import { loadBlock, loadBlockPreview } from "./registry.ts";
import { previewSpec } from "./preview-fixtures.ts";

// Exercise real SVG renderers without a browser layout engine or ResizeObserver.
vi.mock("$lib/components/chart-plot.svelte", async () => ({
  default: (await import("../../testing/chart-plot-fixture.svelte")).default,
}));
vi.mock("$lib/app/session.svelte.ts", () => ({ session: { accent: "blue" } }));

const keys = [
  "bar",
  "line",
  "donut",
  "stacked_bar",
  "scatter",
  "funnel",
  "heatmap",
  "metric",
  "progress",
  "comparison",
] as const;
const configs: Record<(typeof keys)[number], Record<string, unknown>> = {
  bar: { category: "project.name", value: "hours" },
  line: { category: "when", value: "hours" },
  donut: { category: "project.name", value: "hours" },
  stacked_bar: { category: "project.name", series: "phase", value: "hours" },
  scatter: { x: "hours", y: "spent", label: "project.name" },
  funnel: { stage: "project.name", value: "hours" },
  heatmap: { date: "when", value: "hours" },
  metric: { value: "hours", date: "when" },
  progress: { value: "hours", target: 20 },
  comparison: { value: "hours", comparison_view: "previous", comparison_value: "hours" },
};

// Cold Svelte transforms belong to suite setup, not an individual data assertion.
beforeAll(async () => {
  await Promise.all(keys.map((key) => loadBlock(key)));
}, 30_000);

function fixture(nested: boolean): BlockProps {
  const view: ViewDraft = {
    id: "work",
    key: "work",
    label: "Work",
    source: "task",
    fields: ["project.name", "hours", "spent", "when", "phase"],
    aliases: nested
      ? {
          "project.name": ["client", "label"],
          hours: ["figures", "effort"],
          spent: ["figures", "cost"],
          when: ["timing", "date"],
          phase: ["labels", "stage"],
        }
      : {
          "project.name": "client_label",
          hours: "effort",
          spent: "cost",
          when: "on_date",
          phase: "stage",
        },
  };
  const data = [
    { id: "one", name: "Alpha", hours: 7, spent: 2, when: "2026-01-01", phase: "Build" },
    { id: "two", name: "Beta", hours: 3, spent: 4, when: "2026-01-02", phase: "Review" },
    { id: "zero", name: "Alpha", hours: 0, spent: 0, when: "2026-01-03", phase: "Build" },
    { id: "null", name: null, hours: null, spent: null, when: null, phase: null },
  ];
  return {
    config: { view: "work" },
    spec: {
      id: "app",
      key: "app",
      label: "App",
      types: [],
      forms: [],
      workflows: [],
      pages: [],
      views: [
        view,
        { ...view, id: "previous", key: "previous", aliases: { hours: ["baseline", "effort"] } },
      ],
    },
    rows: {
      work: data.map((row) =>
        nested
          ? {
              id: row.id,
              client: { label: row.name },
              figures: { effort: row.hours, cost: row.spent },
              timing: { date: row.when },
              labels: { stage: row.phase },
            }
          : {
              id: row.id,
              client_label: row.name,
              effort: row.hours,
              cost: row.spent,
              on_date: row.when,
              stage: row.phase,
            },
      ),
      previous: [{ id: "previous", baseline: { effort: 20 } }],
    },
  };
}

function text(html: string): string {
  return html
    .replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function body(key: (typeof keys)[number], props: BlockProps): Promise<string> {
  const Component = (await loadBlock(key))!;
  return render(Component, { props: { ...props, config: { ...configs[key], ...props.config } } })
    .body;
}

describe.each([false, true])("analytics with nested=%s", (nested) => {
  it.each(keys)("resolves projected fields in %s", async (key) => {
    const html = await body(key, fixture(nested));
    const content = text(html);
    expect(html).not.toMatch(/NaN|Infinity/);
    switch (key) {
      case "bar":
      case "donut":
      case "funnel":
        expect(content).toContain("Alpha");
        expect(content).toContain("Beta");
        if (key === "donut") expect(content).toMatch(/Total\s+10/);
        break;
      case "line":
        expect(content).toContain("2026-01-01");
        expect(content).toContain("2026-01-03");
        break;
      case "stacked_bar":
        expect(content).toContain("Build");
        expect(content).toContain("Review");
        break;
      case "scatter":
        expect(content).toContain("Alpha: 7 × 2");
        expect(content).toContain("Alpha: 0 × 0");
        expect(html.match(/<circle\b/g)).toHaveLength(3);
        break;
      case "heatmap":
        expect(html).toMatch(/aria-label="[^"]+: 7"/);
        expect(html).toMatch(/aria-label="[^"]+: 3"/);
        break;
      case "metric":
        expect(content).toMatch(/\b10\b/);
        expect(html).toContain("<svg");
        break;
      case "progress":
        expect(html).toContain('aria-valuenow="50"');
        expect(content).toContain("50% complete");
        break;
      case "comparison":
        expect(content).toMatch(/\b10\b/);
        expect(content).toContain("20 comparison");
        expect(content).toContain("50%");
        break;
    }
  });
});

describe("analytics data boundaries", () => {
  it.each(keys)("renders the Library preview for %s", async (key) => {
    const preview = (await loadBlockPreview(key))!;
    const Component = (await loadBlock(key))!;
    const html = render(Component, {
      props: {
        ...preview,
        spec: preview.spec ?? previewSpec,
        rows: preview.rows ?? {},
        ready: true,
      },
    }).body;
    expect(html).not.toMatch(/NaN|Infinity|Pick a view|Nothing to chart yet/);
    expect(text(html)).toContain(String(preview.config.title));
  });

  it.each(["donut", "metric", "progress", "comparison"] as const)(
    "preserves count mode in %s",
    async (key) => {
      const props = fixture(true);
      props.config = { ...props.config, value: "", comparison_value: "" };
      const content = text(await body(key, props));
      expect(content).toMatch(/\b4\b/);
      if (key === "donut") expect(content).toMatch(/Total\s+4/);
      if (key === "comparison") expect(content).toContain("1 comparison");
    },
  );

  it("resolves aggregate group aliases and measure names", async () => {
    const props = fixture(true);
    Object.assign(props.spec!.views[0]!, {
      group_by: "project.name",
      group_alias: "customer",
      measures: { total_hours: { op: "sum", field: "hours" } },
    });
    props.rows.work = [{ customer: "Alpha", total_hours: 10 }];
    props.config.value = "total_hours";
    const html = await body("donut", props);
    expect(text(html)).toContain("Alpha");
    expect(text(html)).toMatch(/Total\s+10/);
  });

  it("omits invalid scatter coordinates without discarding real zeroes", async () => {
    const props = fixture(true);
    props.rows.work!.push(
      { id: "missing", figures: { effort: 5 } },
      { id: "empty", figures: { effort: "", cost: 5 } },
      { id: "invalid", figures: { effort: "invalid", cost: 5 } },
    );
    const html = await body("scatter", props);
    expect(html.match(/<circle\b/g)).toHaveLength(3);
    expect(text(html)).toContain("Alpha: 0 × 0");
  });

  it("keeps a zero comparison denominator finite and omits an undefined percentage", async () => {
    const props = fixture(true);
    props.rows.previous = [{ baseline: { effort: 0 } }];
    const html = await body("comparison", props);
    expect(text(html)).toContain("0 comparison");
    expect(html).not.toMatch(/NaN|Infinity|data-slot="badge"/);
  });

  it.each(keys)("handles empty results in %s", async (key) => {
    const props = fixture(true);
    props.rows = { work: [], previous: [] };
    const html = await body(key, props);
    expect(html).not.toMatch(/NaN|Infinity/);
    if (["bar", "line", "donut", "stacked_bar", "scatter", "funnel"].includes(key))
      expect(text(html)).toContain("Nothing to chart yet");
    else if (key === "heatmap") expect(html).not.toMatch(/aria-label="[^"]+: [1-9]/);
    else expect(text(html)).toMatch(/\b0\b/);
  });

  it.each(keys)("shows a loading state rather than data in %s", async (key) => {
    const props = fixture(true);
    props.ready = false;
    const html = await body(key, props);
    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain("Nothing to chart yet");
  });
});
