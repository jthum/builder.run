import { describe, expect, it } from "vite-plus/test";
import { statusBreakdown } from "./data.ts";
import type { ViewDraft } from "$lib/blocks/presentation.ts";

describe("status breakdown", () => {
  it.each([false, true])("counts projected categories with nested=%s", (nested) => {
    const view: ViewDraft = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: ["phase"],
      aliases: { phase: nested ? ["state", "label"] : "category" },
    };
    const rows = ["Open", "Done", "Done", null].map((phase) =>
      nested ? { state: { label: phase } } : { category: phase },
    );
    expect(statusBreakdown(view, rows, "phase")).toEqual({
      total: 4,
      groups: [
        { label: "Open", value: 1, percent: 25 },
        { label: "Done", value: 2, percent: 50 },
        { label: "None", value: 1, percent: 25 },
      ],
    });
  });

  it("uses an aggregate View's group alias and measure without recounting groups", () => {
    const view: ViewDraft = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: [],
      group_by: "phase",
      group_alias: "category",
      measures: { count: { op: "count" } },
    };
    expect(
      statusBreakdown(
        view,
        [
          { category: "Open", count: 3 },
          { category: "Done", count: 1 },
        ],
        "phase",
        "count",
      ),
    ).toEqual({
      total: 4,
      groups: [
        { label: "Open", value: 3, percent: 75 },
        { label: "Done", value: 1, percent: 25 },
      ],
    });
  });

  it("handles zero, null, missing, invalid and negative weights without invalid percentages", () => {
    const view: ViewDraft = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: ["status", "value"],
    };
    const values = [0, null, undefined, -3, NaN, Infinity, "invalid"];
    expect(
      statusBreakdown(
        view,
        values.map((value) => ({ status: "Open", value })),
        "status",
        "value",
      ),
    ).toEqual({ total: 0, groups: [{ label: "Open", value: 0, percent: 0 }] });
    expect(statusBreakdown(view, [], "status")).toEqual({ total: 0, groups: [] });
  });
});
