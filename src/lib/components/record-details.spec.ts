import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "svelte/server";
import type { CollectionDraft, ViewDraft } from "$lib/blocks/presentation.ts";
import RecordDetails from "./record-details.svelte";
import ViewList from "./view-list.svelte";
import ViewCards from "./view-cards.svelte";
import KanbanBoard from "./kanban-board.svelte";
import CalendarMonth from "./calendar-month.svelte";
import { recordPreview } from "$lib/app/record-preview.svelte.ts";

const type: CollectionDraft = {
  id: "task",
  key: "task",
  label: "Task",
  fields: [
    { id: "name", key: "name", label: "Name", type: "text" },
    { id: "notes", key: "notes", label: "Notes", type: "text", presentation: "textarea" },
    { id: "client", key: "client", label: "Client", type: "reference", target: "client" },
    { id: "enabled", key: "enabled", label: "Enabled", type: "boolean" },
  ],
};
const view: ViewDraft = {
  id: "tasks",
  key: "tasks",
  label: "Tasks",
  source: "task",
  fields: ["name"],
};
afterEach(() => {
  recordPreview.close(false);
  vi.useRealTimers();
});

const presentations: Array<[string, (view: ViewDraft, rows: Record<string, unknown>[]) => string]> =
  [
    ["cards", (view, rows) => render(ViewCards, { props: { view, rows } }).body],
    [
      "Kanban",
      (view, rows) => render(KanbanBoard, { props: { view, rows, field: "status" } }).body,
    ],
    [
      "calendar",
      (view, rows) => render(CalendarMonth, { props: { view, rows, dateField: "due" } }).body,
    ],
  ];

describe("record details rendering", () => {
  it("reuses the same field content for page and compact preview", () => {
    for (const compact of [false, true]) {
      const html = render(RecordDetails, {
        props: {
          type,
          record: { name: "Launch", notes: "First\nSecond", enabled: false, client: "opaque" },
          references: { client: { label: "Northwind", href: "/t/client/one" } },
          compact,
        },
      }).body;
      expect(html).toContain("Launch");
      expect(html).toContain("First\nSecond");
      expect(html).toContain("Northwind");
      expect(html).toContain('href="/t/client/one"');
      expect(html).toContain("No");
      expect(html).not.toContain("opaque");
    }
  });

  it("retains real list links and marks the currently previewed item", () => {
    recordPreview.open("task", "one");
    const html = render(ViewList, {
      props: { view, type, rows: [{ id: "one", name: "Launch" }] },
    }).body;
    expect(html).toContain('href="/t/task/one"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Launch");
  });

  it("lets the drawer place the status in its header without duplicating it in the body", () => {
    const html = render(RecordDetails, {
      props: {
        type: {
          ...type,
          fields: [
            ...type.fields,
            { id: "status", key: "status", label: "Status", type: "enum", values: ["Open"] },
          ],
        },
        record: { name: "Launch", status: "Open", enabled: false },
        compact: true,
        showHeader: false,
        showSummary: false,
      },
    }).body;
    expect(html).not.toMatch(/>Open</);
    expect(html).toContain("No");
  });

  it("does not present aggregate rows as previewable records", () => {
    const html = render(ViewList, {
      props: { view: { ...view, group_by: "name" }, rows: [{ id: "group", name: "Launch" }] },
    }).body;
    expect(html).toContain("Launch");
    expect(html).not.toContain('href="/t/');
  });

  it("gives Kanban item surfaces the same semantic border as Chrome card content", () => {
    const html = render(KanbanBoard, {
      props: { view, rows: [{ id: "one", name: "Launch", status: "todo" }], field: "status" },
    }).body;
    const items = [...html.matchAll(/data-variant="inset"\s+class="([^"]*)"/g)];
    expect(items).toHaveLength(1);
    for (const item of items) {
      const classes = item[1]!.split(/\s+/);
      expect(classes).toContain("border");
      expect(classes).toContain("border-border");
    }
  });

  describe.each(presentations)("%s record previews", (_name, renderView) => {
    it("retains encoded record links and indicates the previewed item", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
      recordPreview.open("task", "one/two");
      const html = renderView(view, [
        { id: "one/two", name: "Launch", status: "todo", due: "2026-10-17" },
      ]);
      expect(html).toContain('href="/t/task/one%2Ftwo"');
      expect(html).toContain('aria-current="true"');
      expect(html).toContain("Launch");
    });

    it.each([
      ["aggregate", { ...view, group_by: "name" }, { id: "group" }],
      ["missing identity", view, {}],
    ] as const)("renders %s results without broken record links", (_case, definition, identity) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
      const html = renderView(definition, [
        { ...identity, name: "Launch", status: "todo", due: "2026-10-17" },
      ]);
      expect(html).toContain("Launch");
      expect(html).not.toContain('href="/t/');
      expect(html).not.toContain('aria-current="true"');
    });
  });
});
