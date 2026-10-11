import { describe, expect, it } from "vite-plus/test";
import type { PageContext, PageNode, PagePresentation } from "$lib/blocks/presentation.ts";
import {
  appendInGroup,
  collectViewKeys,
  configurePageRows,
  configureBlockConfig,
  defaultRowHeight,
  describeBlock,
  groupHeightClass,
  groupPagesByFolder,
  moveAuthoredPage,
  defaultBlockConfig,
  fieldsForView,
  implicitHomePage,
  insertBlock,
  moveInGroup,
  moveSibling,
  normalizeBlock,
  normalizeBlockList,
  normalizePage,
  removeBlock,
  rowHeightClass,
  setBlock,
  setGroupColumns,
  blockByKey,
  blockInputs,
} from "./blocks.ts";

describe("page folders", () => {
  it("moves a page before another and into a folder", () => {
    expect.hasAssertions();
    const pages = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c", label: "C", folder: "Ops" },
    ] as PagePresentation[];
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
    ] as PagePresentation[];
    expect(groupPagesByFolder(pages)).toEqual([
      { folder: null, pages: [pages[1]] },
      { folder: "Ops", pages: [pages[0]] },
      { folder: "Finance", pages: [pages[2], pages[3]] },
    ]);
  });
});

describe("page blocks", () => {
  it("preserves opaque canonical IDs without imposing a length or alphabet", () => {
    const block: PageNode = {
      id: "long_framework-id_with-underscores",
      kind: "block",
      block: "text",
      config: { text: "Note" },
    };
    const group: PageNode = { id: "root-layout", kind: "group", blocks: [block] };
    expect(normalizeBlock(group)).toMatchObject({ id: group.id, blocks: [{ id: block.id }] });
    expect(normalizeBlock(block)).toEqual(block);
  });
  it("assigns stable layout identity and preserves it through reordering", () => {
    expect.hasAssertions();
    const first = normalizePage({
      id: "A000000000000001",
      key: "overview",
      label: "Overview",
      blocks: [
        { kind: "block", block: "text", config: { text: "A" } },
        { kind: "block", block: "text", config: { text: "B" } },
      ],
    });
    const [firstRow, secondRow] = first.blocks;
    expect(firstRow?.id).toBeTruthy();
    expect(firstRow?.kind === "group" ? firstRow.blocks[0]?.id : undefined).toBeTruthy();

    const reordered = normalizePage({ ...first, blocks: [secondRow!, firstRow!] });
    expect(reordered.blocks.map((block) => block.id)).toEqual([secondRow?.id, firstRow?.id]);
    expect(
      reordered.blocks.map((block) => (block.kind === "group" ? block.blocks[0]?.id : undefined)),
    ).toEqual([
      secondRow?.kind === "group" ? secondRow.blocks[0]?.id : undefined,
      firstRow?.kind === "group" ? firstRow.blocks[0]?.id : undefined,
    ]);
  });

  it("keeps only block and group blocks", () => {
    expect.hasAssertions();
    expect(
      normalizeBlock({ kind: "block", block: "table", config: { view: "unpaid_invoices" } }),
    ).toMatchObject({
      kind: "block",
      block: "table",
      config: { view: "unpaid_invoices" },
    });
    expect(normalizeBlock({ kind: "group", columns: 9, blocks: [] })).toMatchObject({
      kind: "group",
      columns: 4,
      blocks: [],
    });
  });

  it("guesses view and field defaults for a bar chart", () => {
    expect.hasAssertions();
    const spec = {
      views: [{ key: "project_list", source: "project", fields: ["name", "status", "budget"] }],
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
      workflows: [],
    } as never;
    const bar = blockByKey("bar");
    expect(bar).toBeTruthy();
    expect(defaultBlockConfig(bar!, spec)).toMatchObject({
      view: "project_list",
      category: "name",
      value: "budget",
    });
  });

  it("offers grouped dimensions and measures to chart blocks", () => {
    expect.hasAssertions();
    const spec = {
      views: [
        {
          key: "leaderboard",
          source: "review",
          fields: ["submission", "overall_score"],
          group_by: "submission",
          measures: { overall_score: { op: "avg", field: "score" } },
        },
      ],
      types: [
        {
          key: "review",
          fields: [
            { key: "submission", type: "reference", label: "Submission" },
            { key: "score", type: "number", label: "Score" },
          ],
        },
      ],
      forms: [],
      workflows: [],
    } as never;
    expect(fieldsForView(spec, "leaderboard").map((field) => [field.key, field.type])).toEqual([
      ["submission", "reference"],
      ["overall_score", "number"],
    ]);
    const description = describeBlock(spec, "bar", { view: "leaderboard" });
    expect(description.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "category",
          dependsOn: "view",
          options: [
            { value: "submission", label: "Submission" },
            { value: "overall_score", label: "Overall Score" },
          ],
        }),
        expect.objectContaining({
          key: "value",
          fieldKind: "number",
          options: [{ value: "overall_score", label: "Overall Score" }],
        }),
      ]),
    );
  });

  it("offers an optional title for form blocks", () => {
    expect.hasAssertions();
    const form = blockByKey("form");
    expect(form).toBeTruthy();
    expect(blockInputs(form!).map((input) => input.key)).toEqual(["title", "form"]);
  });

  it("validates block config and fills only unambiguous required fields", () => {
    expect.hasAssertions();
    const spec = {
      views: [
        { key: "tasks", label: "Tasks", source: "task", fields: ["title", "status", "points"] },
      ],
      types: [
        {
          key: "task",
          fields: [
            { key: "title", type: "text", label: "Title" },
            { key: "status", type: "enum", label: "Status" },
            { key: "points", type: "number", label: "Points" },
          ],
        },
      ],
      forms: [],
      workflows: [],
    } as never;
    expect(
      configurePageRows(spec, [{ kind: "block", block: "kanban", config: { view: "tasks" } }]),
    ).toMatchObject([
      {
        kind: "group",
        columns: 1,
        blocks: [{ kind: "block", block: "kanban", config: { view: "tasks", field: "status" } }],
      },
    ]);
    expect(() =>
      configurePageRows(spec, [
        { kind: "block", block: "bar", config: { view: "tasks", value: "points" } },
      ]),
    ).toThrow('Block "bar" requires config.category. Valid options: title, status, points.');
    expect(() =>
      configurePageRows(spec, [
        { kind: "block", block: "kanban", config: { view: "tasks", field: "points" } },
      ]),
    ).toThrow('Block "kanban" config.field cannot be "points". Valid options: status.');

    const progress = blockByKey("progress");
    expect(progress).toBeTruthy();
    expect(() =>
      configureBlockConfig(spec, progress!, {
        view: "tasks",
        target: "100",
      }),
    ).toThrow('Block "progress" config.target must be a finite number');
  });

  it("wraps a single nested block object so group.blocks.filter never throws", () => {
    expect.hasAssertions();
    const block = { kind: "block" as const, block: "table", config: { view: "recent_time" } };
    expect(
      normalizeBlockList([{ kind: "group", columns: 1, blocks: block as never }]),
    ).toMatchObject([
      {
        kind: "group",
        columns: 1,
        blocks: [block],
      },
    ]);
    expect(normalizeBlockList(block)).toMatchObject([block]);
    expect(normalizeBlockList(JSON.stringify([block]))).toMatchObject([block]);
    expect(normalizeBlockList({ 0: block })).toMatchObject([block]);
    expect(normalizeBlockList(undefined)).toEqual([]);
  });

  it("wraps root blocks in editable grid rows", () => {
    expect.hasAssertions();
    const heading = {
      kind: "block" as const,
      block: "heading",
      config: { title: "Overview", description: "At a glance" },
    };
    expect(
      normalizePage({
        id: "C000000000000001",
        key: "overview",
        label: "Overview",
        blocks: [heading],
      }).blocks,
    ).toMatchObject([
      {
        kind: "group",
        columns: 1,
        blocks: [heading],
      },
    ]);
  });

  it("builds a home page of number cards and compact tables from featured views", () => {
    expect.hasAssertions();
    const spec = {
      views: [
        { key: "active_projects", label: "Active projects", source: "project", implicit: false },
        { key: "unpaid_invoices", label: "Unpaid invoices", source: "invoice", implicit: false },
        { key: "project_list", label: "Projects", source: "project", implicit: true },
      ],
      types: [{ key: "project" }],
    } as unknown as PageContext;
    const home = implicitHomePage(spec);
    expect(collectViewKeys(home.blocks)).toEqual(["active_projects", "unpaid_invoices"]);
    const stats = home.blocks[0];
    expect(stats?.kind).toBe("group");
    if (stats?.kind !== "group") return;
    expect(stats.columns).toBe(2);
    expect(stats.blocks.map((block) => block.kind === "block" && block.block)).toEqual([
      "stat",
      "stat",
    ]);
    const table = home.blocks[1];
    expect(table?.kind).toBe("group");
    if (table?.kind !== "group") return;
    expect(table.blocks[0]).toMatchObject({
      kind: "block",
      block: "table",
      config: { view: "active_projects", compact: true },
    });
  });

  it("inserts, updates, and removes nested blocks", () => {
    expect.hasAssertions();
    const heading: PageNode = { kind: "block", block: "heading", config: { title: "Hi" } };
    const group: PageNode = { kind: "group", columns: 2, blocks: [heading] };
    const withGroup = insertBlock([], [0], group);
    const next = appendInGroup(withGroup, [0], {
      kind: "block",
      block: "text",
      config: { text: "Body" },
    });
    const updated = setBlock(next, [0, 0], {
      kind: "block",
      block: "heading",
      config: { title: "There" },
    });
    const removed = removeBlock(updated, [0, 1]);
    const inner = removed[0];
    expect(inner?.kind).toBe("group");
    if (inner?.kind !== "group") return;
    expect(inner.blocks).toHaveLength(1);
    expect(inner.blocks[0]).toMatchObject({ config: { title: "There" } });
  });

  it("reorders rows and blocks, and keeps blocks when shrinking columns", () => {
    expect.hasAssertions();
    const a: PageNode = { kind: "block", block: "text", config: { text: "A" } };
    const b: PageNode = { kind: "block", block: "text", config: { text: "B" } };
    const c: PageNode = { kind: "block", block: "text", config: { text: "C" } };
    const row: PageNode = { kind: "group", columns: 2, blocks: [a, b, c] };
    const other: PageNode = { kind: "group", columns: 1, blocks: [a] };
    expect(
      moveSibling([row, other], 1, 0).map((item) => item.kind === "group" && item.columns),
    ).toEqual([1, 2]);
    const moved = moveInGroup([row], 0, 2, 0);
    const inner = moved[0];
    expect(inner?.kind).toBe("group");
    if (inner?.kind !== "group") return;
    expect(inner.blocks.map((item) => item.kind === "block" && item.config?.text)).toEqual([
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

  it("gives automatic chart rows enough plot space while respecting explicit heights", () => {
    expect.hasAssertions();
    const chart: PageNode = { kind: "block", block: "bar", config: {} };
    const heading: PageNode = { kind: "block", block: "heading", config: {} };
    const automatic: PageNode = { kind: "group", columns: 2, blocks: [heading, chart] };
    const compact: PageNode = { ...automatic, min_height: "s" };

    expect(defaultRowHeight([heading])).toBeUndefined();
    expect(defaultRowHeight([chart])).toBe("m");
    expect(groupHeightClass(automatic)).toBe("min-h-80");
    expect(groupHeightClass(compact)).toBe("min-h-48");
  });
});
