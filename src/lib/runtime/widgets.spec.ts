import { describe, expect, it } from "vite-plus/test";
import type { AppSpec, PageBlock, PageDef } from "./model.ts";
import {
  appendInGroup,
  collectViewKeys,
  groupPagesByFolder,
  moveAuthoredPage,
  defaultWidgetValues,
  implicitHomePage,
  insertBlock,
  moveInGroup,
  moveSibling,
  normalizeBlock,
  normalizeBlockList,
  removeBlock,
  rowHeightClass,
  setBlock,
  setGroupColumns,
  widgetByKey,
} from "./widgets.ts";

describe("page folders", () => {
  it("moves a page before another and into a folder", () => {
    expect.hasAssertions();
    const pages = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c", label: "C", folder: "Ops" },
    ] as PageDef[];
    const intoOps = moveAuthoredPage(pages, "a", { folder: "Ops", beforeKey: "c" });
    expect(intoOps.map((page) => [page.key, page.folder ?? null])).toEqual([
      ["b", null],
      ["a", "Ops"],
      ["c", "Ops"],
    ]);
    const toTop = moveAuthoredPage(intoOps, "c", { folder: null });
    expect(toTop.map((page) => page.key)).toEqual(["b", "c", "a"]);
    expect(toTop.find((page) => page.key === "c")?.folder).toBeUndefined();
  });

  it("groups authored pages with ungrouped first, then folders in order", () => {
    expect.hasAssertions();
    const pages = [
      { key: "status", label: "Status", folder: "Ops" },
      { key: "welcome", label: "Welcome" },
      { key: "cash", label: "Cash", folder: "Finance" },
      { key: "invoices", label: "Invoices", folder: "Finance" },
    ] as PageDef[];
    expect(groupPagesByFolder(pages)).toEqual([
      { folder: null, pages: [pages[1]] },
      { folder: "Ops", pages: [pages[0]] },
      { folder: "Finance", pages: [pages[2], pages[3]] },
    ]);
  });
});

describe("page widgets", () => {
  it("keeps only widget and group blocks", () => {
    expect.hasAssertions();
    expect(
      normalizeBlock({ kind: "widget", widget: "table", values: { view: "unpaid_invoices" } }),
    ).toEqual({
      kind: "widget",
      widget: "table",
      values: { view: "unpaid_invoices" },
    });
    expect(normalizeBlock({ kind: "group", columns: 9, blocks: [] })).toEqual({
      kind: "group",
      columns: 4,
      blocks: [],
    });
  });

  it("guesses view and field defaults for a bar chart", () => {
    expect.hasAssertions();
    const spec = {
      views: [{ key: "project_list", source: "project", fields: ["name", "status"] }],
      types: [
        {
          key: "project",
          fields: [
            { key: "name", type: "text", label: "Name" },
            { key: "status", type: "enum", label: "Status" },
            { key: "budget", type: "number", label: "Budget" },
          ],
        },
      ],
      forms: [],
      flows: [],
    } as never;
    const bar = widgetByKey("bar");
    expect(bar).toBeTruthy();
    expect(defaultWidgetValues(bar!, spec)).toMatchObject({
      view: "project_list",
      category: "name",
      value: "budget",
    });
  });

  it("wraps a single nested block object so group.blocks.filter never throws", () => {
    expect.hasAssertions();
    const widget = { kind: "widget" as const, widget: "table", values: { view: "recent_time" } };
    expect(normalizeBlockList([{ kind: "group", columns: 1, blocks: widget as never }])).toEqual([
      {
        kind: "group",
        columns: 1,
        blocks: [widget],
      },
    ]);
    expect(normalizeBlockList(widget)).toEqual([widget]);
    expect(normalizeBlockList(JSON.stringify([widget]))).toEqual([widget]);
    expect(normalizeBlockList({ 0: widget })).toEqual([widget]);
    expect(normalizeBlockList(undefined)).toEqual([]);
  });

  it("builds a home page of number cards and compact tables from featured views", () => {
    expect.hasAssertions();
    const spec = {
      views: [
        { key: "active_projects", label: "Active projects", source: "project", implicit: false },
        { key: "unpaid_invoices", label: "Unpaid invoices", source: "invoice", implicit: false },
        { key: "project_list", label: "Projects", source: "project", implicit: true },
      ],
      types: [{ key: "project", store: "local" }],
    } as AppSpec;
    const home = implicitHomePage(spec);
    expect(collectViewKeys(home.blocks)).toEqual(["active_projects", "unpaid_invoices"]);
    const stats = home.blocks[0];
    expect(stats?.kind).toBe("group");
    if (stats?.kind !== "group") return;
    expect(stats.columns).toBe(2);
    expect(stats.blocks.map((block) => block.kind === "widget" && block.widget)).toEqual([
      "stat",
      "stat",
    ]);
    const table = home.blocks[1];
    expect(table?.kind).toBe("group");
    if (table?.kind !== "group") return;
    expect(table.blocks[0]).toMatchObject({
      kind: "widget",
      widget: "table",
      values: { view: "active_projects", compact: true },
    });
  });

  it("inserts, updates, and removes nested widgets", () => {
    expect.hasAssertions();
    const heading: PageBlock = { kind: "widget", widget: "heading", values: { title: "Hi" } };
    const group: PageBlock = { kind: "group", columns: 2, blocks: [heading] };
    const withGroup = insertBlock([], [0], group);
    const next = appendInGroup(withGroup, [0], {
      kind: "widget",
      widget: "text",
      values: { text: "Body" },
    });
    const updated = setBlock(next, [0, 0], {
      kind: "widget",
      widget: "heading",
      values: { title: "There" },
    });
    const removed = removeBlock(updated, [0, 1]);
    const inner = removed[0];
    expect(inner?.kind).toBe("group");
    if (inner?.kind !== "group") return;
    expect(inner.blocks).toHaveLength(1);
    expect(inner.blocks[0]).toMatchObject({ values: { title: "There" } });
  });

  it("reorders rows and widgets, and keeps widgets when shrinking columns", () => {
    expect.hasAssertions();
    const a: PageBlock = { kind: "widget", widget: "text", values: { text: "A" } };
    const b: PageBlock = { kind: "widget", widget: "text", values: { text: "B" } };
    const c: PageBlock = { kind: "widget", widget: "text", values: { text: "C" } };
    const row: PageBlock = { kind: "group", columns: 2, blocks: [a, b, c] };
    const other: PageBlock = { kind: "group", columns: 1, blocks: [a] };
    expect(
      moveSibling([row, other], 1, 0).map((item) => item.kind === "group" && item.columns),
    ).toEqual([1, 2]);
    const moved = moveInGroup([row], 0, 2, 0);
    const inner = moved[0];
    expect(inner?.kind).toBe("group");
    if (inner?.kind !== "group") return;
    expect(inner.blocks.map((item) => item.kind === "widget" && item.values?.text)).toEqual([
      "C",
      "A",
      "B",
    ]);
    const stacked = setGroupColumns([row], 0, 1);
    const next = stacked[0];
    expect(next?.kind).toBe("group");
    if (next?.kind !== "group") return;
    expect(next.columns).toBe(1);
    expect(next.blocks).toHaveLength(3);
  });

  it("keeps default rows automatic and maps explicit height tokens", () => {
    expect.hasAssertions();
    expect(rowHeightClass(undefined)).toBe("");
    expect(rowHeightClass("s")).toBe("min-h-48");
    expect(rowHeightClass("xl")).toBe("min-h-[32rem]");
  });
});
