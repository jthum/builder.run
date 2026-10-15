import { describe, expect, it } from "vite-plus/test";
import {
  viewCellValue,
  viewDisplayFields,
  viewOutputKey,
  viewReferenceHref,
} from "./view-results.ts";
import type { CollectionDraft, ViewDraft } from "@jthum/framework/svelte/authoring/data";

describe("View result projection", () => {
  it("reads nested identity and label projections and links only selected identities", () => {
    const view: ViewDraft = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: ["title", "project.name", "project"],
      aliases: { "project.name": ["engagement", "name"], project: ["engagement", "id"] },
    };
    const task: CollectionDraft = {
      id: "tasks",
      key: "task",
      label: "Task",
      fields: [
        { id: "title", key: "title", label: "Title", type: "text" },
        { id: "project", key: "project", label: "Project", type: "reference", target: "project" },
      ],
    };
    const project: CollectionDraft = {
      id: "projects",
      key: "project",
      label: "Project",
      fields: [{ id: "name", key: "name", label: "Name", type: "text" }],
    };
    const row = { engagement: { id: "project/1", name: "Launch" } };
    expect(viewOutputKey(view, "project.name")).toBe("engagement.name");
    expect(viewCellValue(view, row, "project.name")).toBe("Launch");
    expect(viewCellValue(view, { engagement: { name: null } }, "project.name")).toBeNull();
    expect(viewCellValue(view, { engagement: null }, "project.name")).toBeUndefined();
    expect(viewReferenceHref(view, row, "project.name", [task, project])).toBe(
      "/t/project/project%2F1",
    );
    expect(
      viewReferenceHref(view, { engagement: { name: "Launch" } }, "project.name", [task, project]),
    ).toBeUndefined();
    expect(
      viewReferenceHref(view, { engagement: { id: ["a", "b"] } }, "project.name", [task, project]),
    ).toBeUndefined();
    expect(viewDisplayFields(view, task)).toEqual(["title", "project.name"]);
    expect(viewDisplayFields({ ...view, fields: ["title", "project"] }, task)).toEqual([
      "title",
      "project",
    ]);
    expect(
      viewCellValue(
        { ...view, aliases: { "project.name": ["toString", "name"] } },
        {},
        "project.name",
      ),
    ).toBeUndefined();
  });

  it("reads projected relationship labels without replacing null or falsy values", () => {
    const view = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task",
      fields: ["project.name", "estimate", "completed"],
      aliases: { "project.name": "engagement" },
    };
    const row = { engagement: "Website launch", estimate: 0, completed: false };
    expect(viewCellValue(view, row, "project.name")).toBe("Website launch");
    expect(viewCellValue(view, row, "estimate")).toBe(0);
    expect(viewCellValue(view, row, "completed")).toBe(false);
    expect(viewCellValue(view, { engagement: null }, "project.name")).toBeNull();
    expect(viewCellValue(view, {}, "project.name")).toBeUndefined();
    expect(viewCellValue(undefined, row, "project.name")).toBeUndefined();
    expect(viewCellValue(view, row, "")).toBeUndefined();
  });

  it("maps readable relationship paths to canonical selection aliases", () => {
    const view = {
      id: "portfolio",
      key: "portfolio",
      label: "Portfolio",
      source: "project",
      fields: ["name", "client.name"],
    };
    expect(viewOutputKey(view, "name")).toBe("name");
    expect(viewOutputKey(view, "client.name")).toBe("client_name");
  });

  it("retains explicitly authored and aggregate aliases", () => {
    expect(
      viewOutputKey(
        {
          id: "portfolio",
          key: "portfolio",
          label: "Portfolio",
          source: "project",
          fields: ["client.name"],
          aliases: { "client.name": "customer" },
        },
        "client.name",
      ),
    ).toBe("customer");
    expect(
      viewOutputKey(
        {
          id: "summary",
          key: "summary",
          label: "Summary",
          source: "project",
          fields: ["client", "count"],
          group_by: "client",
          group_alias: "customer",
          measures: { count: { op: "count" } },
        },
        "client",
      ),
    ).toBe("customer");
  });
});
