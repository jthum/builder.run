import { describe, expect, it } from "vite-plus/test";
import { render } from "svelte/server";
import { loadEditorContext } from "@jthum/framework/svelte/authoring/adapters";
import type { PageLayoutNode } from "@jthum/framework/spec";
import { openRuntime, emptySpec } from "$lib/framework/bootstrap.ts";
import { createKernelSqlitePersistence } from "$lib/framework/sqlite.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { seedApp } from "$lib/app/app-templates.ts";
import { pageContext } from "$lib/app/pages.ts";
import { viewCellValue } from "$lib/app/view-results.ts";
import Leaderboard from "./leaderboard/block.svelte";
import Timeline from "./timeline/block.svelte";
import Spotlight from "../highlights/spotlight/block.svelte";
import ActivityFeed from "../highlights/activity-feed/block.svelte";
import ViewList from "$lib/components/view-list.svelte";
import ViewCards from "$lib/components/view-cards.svelte";
import KanbanBoard from "$lib/components/kanban-board.svelte";
import { loadBlockPreview } from "$lib/blocks/registry.ts";

function blocks(
  nodes: readonly PageLayoutNode[],
): Array<Extract<PageLayoutNode, { kind: "block" }>> {
  return nodes.flatMap((node) => (node.kind === "group" ? blocks(node.children) : [node]));
}

describe("reference fields in data blocks", () => {
  it("renders nested relationship labels on the Kanban board", () => {
    const view = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: ["title", "project.name", "status"],
      aliases: { "project.name": ["project", "name"] },
    };
    const body = render(KanbanBoard, {
      props: {
        view,
        field: "status",
        rows: [
          {
            id: "task",
            title: "Launch checklist",
            project: { name: "Website launch" },
            status: "todo",
          },
        ],
      },
    }).body;
    expect(body).toContain("Launch checklist");
    expect(body).toContain("Website launch");
    expect(body).not.toContain("—");
  });

  it.each([
    ["list", ViewList],
    ["cards", ViewCards],
  ] as const)("renders aliased relationship values in the %s view", (_key, Component) => {
    const view = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: ["title", "project.name"],
      aliases: { title: "task_title", "project.name": "engagement" },
    };
    const body = render(Component, {
      props: {
        view,
        rows: [{ id: "task", task_title: "Launch checklist", engagement: "Website launch" }],
      },
    }).body;
    expect(body).toContain("Launch checklist");
    expect(body).toContain("Website launch");
    expect(body).not.toContain("—");
  });

  it.each([
    ["leaderboard", Leaderboard],
    ["timeline", Timeline],
  ] as const)(
    "uses explicit aliases for %s values and ordering before limiting",
    (key, Component) => {
      const spec = {
        id: "test",
        key: "test",
        label: "Test",
        types: [],
        forms: [],
        workflows: [],
        pages: [],
        views: [
          {
            id: "tasks",
            key: "tasks",
            label: "Tasks",
            source: "task",
            fields: ["title", "project.name", "estimate", "due_date"],
            aliases: {
              title: "task_title",
              "project.name": "engagement",
              estimate: "hours",
              due_date: "deadline",
            },
          },
        ],
      };
      const rows = {
        tasks: [
          {
            id: "later",
            task_title: "Smaller task",
            engagement: "Later project",
            hours: 2,
            deadline: "2026-10-20",
          },
          {
            id: "earlier",
            task_title: "Larger task",
            engagement: "Earlier project",
            hours: 10,
            deadline: "2026-10-10",
          },
        ],
      };
      const config = {
        view: "tasks",
        label_field: "title",
        value_field: "estimate",
        detail_field: "project.name",
        title_field: "title",
        description_field: "project.name",
        date_field: "due_date",
        limit: 1,
      };
      const body = render(Component, { props: { config, rows, spec } }).body;
      expect(body).toContain("Larger task");
      expect(body).toContain("Earlier project");
      expect(body).not.toContain("Smaller task");
      expect(body).not.toContain("—");
    },
  );

  it.each([
    ["leaderboard", Leaderboard],
    ["timeline", Timeline],
  ] as const)("renders project names in the seeded Project tracker %s", async (key, Component) => {
    const runtime = await openRuntime({
      kernel: { persistence: createKernelSqlitePersistence(createNodeGateway()) },
      seed: {
        spaceName: "Space",
        appName: "Home",
        user: { name: "Jane" },
        spaceSpec: emptySpec("space", "Space"),
        appSpec: emptySpec("home", "Home"),
      },
    });
    try {
      const app = await seedApp(runtime, "Projects", "project_tracker");
      const { spec, context } = await loadEditorContext(app.appClient);
      const node = blocks(spec.pages.find((page) => page.key === "home")!.layout).find(
        (block) => block.block === key,
      )!;
      const config = { ...node.config };
      if (typeof config.view !== "string") throw new Error("Template block is missing its View");
      const result = await app.appClient.queryView(config.view);
      const rows: Array<Record<string, unknown>> = result.data.rows.map((row) => ({
        id: row.id,
        ...row.values,
      }));
      const visible = [...rows]
        .sort((a, b) =>
          key === "leaderboard"
            ? Number(b.estimate) - Number(a.estimate)
            : String(a.due_date).localeCompare(String(b.due_date)),
        )
        .slice(0, Number(config.limit));
      const view = context.views.find((view) => view.key === config.view)!;
      const names = new Set(visible.map((row) => viewCellValue(view, row, "project.name")));
      expect(names.size).toBeGreaterThan(1);
      const body = render(Component, {
        props: {
          config,
          rows: { all_tasks: rows },
          spec: pageContext(spec, context),
        },
      }).body;
      for (const name of names) {
        expect(typeof name).toBe("string");
        expect(body).toContain(String(name));
      }
      expect(body).not.toContain("—");
      expect(body.match(/href="\/t\/project\//g)).toHaveLength(visible.length);
      expect(body).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
    } finally {
      await runtime.kernel.close();
    }
  });

  it.each([
    ["leaderboard", Leaderboard, "Contoso Labs"],
    ["timeline", Timeline, "Website launch"],
    ["spotlight", Spotlight, "Northwind"],
    ["activity_feed", ActivityFeed, "Website launch"],
  ] as const)("renders related names in the %s preview", async (key, Component, name) => {
    const preview = (await loadBlockPreview(key))!;
    const body = render(Component, {
      props: { config: preview.config, rows: preview.rows ?? {}, spec: preview.spec },
    }).body;
    expect(body).toContain(name);
  });
});
