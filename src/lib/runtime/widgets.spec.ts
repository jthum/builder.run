import { describe, expect, it } from "vite-plus/test";
import type { AppSpec, PageBlock } from "./model.ts";
import {
  appendInGroup,
  collectViewKeys,
  implicitHomePage,
  insertBlock,
  normalizeBlock,
  removeBlock,
  setBlock,
} from "./widgets.ts";

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
});
