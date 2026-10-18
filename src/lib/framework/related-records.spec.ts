import { describe, expect, it } from "vite-plus/test";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { createKernelSqlitePersistence } from "./sqlite.ts";
import { emptySpec, openRuntime } from "./bootstrap.ts";
import { relatedRecordQuery } from "$lib/app/record-details.ts";
import type { ViewDefinition } from "@jthum/framework/spec";

describe("related record query", () => {
  it("restricts related rows in SQLite while preserving the View's projected labels and ordering", async () => {
    const view: ViewDefinition = {
      id: "tasks_view",
      key: "tasks",
      label: "Tasks",
      source: "task",
      query: {
        select: [
          { path: ["title"], as: "task_title" },
          { path: ["project", "project_name"], as: ["project", "name"] },
        ],
        sort: [{ path: ["title"], direction: "desc" }],
        filter: { path: ["open"], operator: "eq", value: true },
      },
    };
    const runtime = await openRuntime({
      kernel: { persistence: createKernelSqlitePersistence(createNodeGateway()) },
      seed: {
        spaceName: "Space",
        appName: "Work",
        user: { name: "Jane" },
        spaceSpec: emptySpec("space", "Space"),
        appSpec: {
          ...emptySpec("work", "Work"),
          collections: [
            {
              id: "projects",
              key: "project",
              label: "Project",
              fields: [{ id: "project_name", key: "name", label: "Name", type: "text" }],
            },
            {
              id: "tasks",
              key: "task",
              label: "Task",
              fields: [
                { id: "title", key: "title", label: "Title", type: "text" },
                {
                  id: "project",
                  key: "project",
                  label: "Project",
                  type: "reference",
                  sourceId: "projects",
                },
                { id: "open", key: "open", label: "Open", type: "boolean" },
              ],
            },
          ],
          views: [view],
        },
      },
    });
    try {
      const client = runtime.appClient;
      const first = await client.createRecord("project", { name: "Launch" });
      const other = await client.createRecord("project", { name: "Other" });
      await client.createRecord("task", { title: "Alpha", project: first.id, open: true });
      await client.createRecord("task", { title: "Beta", project: first.id, open: true });
      await client.createRecord("task", { title: "Closed", project: first.id, open: false });
      await client.createRecord("task", { title: "Unrelated", project: other.id, open: true });
      const result = await client.querySource(
        "task",
        relatedRecordQuery(view, "project", first.id),
      );
      expect(result.rows.map((row) => row.values)).toEqual([
        { task_title: "Beta", project: { name: "Launch" } },
        { task_title: "Alpha", project: { name: "Launch" } },
      ]);
    } finally {
      await runtime.kernel.close();
    }
  });
});
