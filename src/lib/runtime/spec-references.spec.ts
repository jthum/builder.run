import { describe, expect, it } from "vite-plus/test";
import { normalizeSpec } from "./model.ts";
import {
  findFieldReferences,
  findTypeReferences,
  rewriteFieldReferences,
  rewriteTypeReferences,
} from "./spec-references.ts";

function referenceSpec() {
  return normalizeSpec({
    types: {
      client: {
        fields: {
          name: "text",
          display_name: {
            type: "text",
            visible_when: { field: "name", op: "not_empty" },
          },
        },
      },
      project: {
        fields: {
          client: { type: "reference", target: "client" },
          budget: "number",
        },
      },
    },
    views: {
      projects: {
        source: "project",
        fields: ["client.name", "budget"],
        where: [{ field: "client.name", op: "not_empty" }],
        order_by: { "client.name": "asc" },
        group_by: "client.name",
        measures: { names: { op: "count", field: "client.name" } },
      },
    },
    forms: { client_form: { type: "client", fields: ["name"], mode: "create" } },
    workflows: {
      update_client: {
        input: { client: { record: "client" } },
        trigger: { key: "client.name.changed" },
        steps: [
          {
            effect: {
              key: "records.create",
              params: { type: "client", fields: { name: "New client" } },
              as: "created",
            },
          },
          {
            effect: {
              key: "records.set",
              params: { record: { $ref: "vars.created" }, values: { name: "Updated client" } },
            },
          },
          {
            gate: {
              predicate: { op: "context.filled", path: "vars.client.name" },
              pass: [
                {
                  effect: {
                    key: "records.set",
                    params: {
                      record: { $ref: "vars.client" },
                      values: { name: { $ref: "vars.client.name" } },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    pages: {
      overview: {
        blocks: [
          {
            kind: "widget",
            widget: "bar",
            values: { view: "projects", category: "client.name", value: "budget" },
          },
        ],
      },
      client_home: {
        blocks: [
          { kind: "widget", widget: "table", values: { view: "client_list" } },
          { kind: "widget", widget: "form", values: { form: "client_create" } },
        ],
      },
    },
  } as never);
}

describe("spec references", () => {
  it("finds field references across the authored feature surface", () => {
    const references = findFieldReferences(referenceSpec(), "client", "name");
    expect(new Set(references.map((reference) => reference.owner))).toEqual(
      new Set(["type", "view", "form", "workflow", "page"]),
    );
    expect(references.map((reference) => reference.description)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("field condition"),
        expect.stringContaining("column"),
        expect.stringContaining("trigger"),
        expect.stringContaining("widget field"),
      ]),
    );
  });

  it("rewrites direct, related, widget, and workflow field references", () => {
    const renamed = rewriteFieldReferences(referenceSpec(), "client", "name", "legal_name");
    const view = renamed.views.find((item) => item.key === "projects")!;
    const workflow = renamed.workflows.find((item) => item.key === "update_client")!;

    expect(view.fields).toContain("client.legal_name");
    expect(view.where).toContainEqual(expect.objectContaining({ field: "client.legal_name" }));
    expect(view.order_by).toHaveProperty("client.legal_name", "asc");
    expect(view.group_by).toBe("client.legal_name");
    expect(view.measures?.names.field).toBe("client.legal_name");
    expect(renamed.forms[0]?.fields).toEqual(["legal_name"]);
    expect(renamed.types[0]?.fields[1]?.visible_when).toMatchObject({ field: "legal_name" });
    expect(renamed.pages[0]?.blocks[0]).toMatchObject({
      values: { view: "projects", category: "client.legal_name", value: "budget" },
    });
    expect(workflow.trigger?.key).toBe("client.legal_name.changed");
    expect(JSON.stringify(workflow.steps)).toContain("vars.client.legal_name");
    expect(JSON.stringify(workflow.steps)).toContain('"legal_name"');
    expect(JSON.stringify(workflow.steps)).not.toContain('"name"');
    expect(findFieldReferences(renamed, "client", "name")).toEqual([]);
  });

  it("finds and rewrites type references without changing definitions", () => {
    const spec = referenceSpec();
    const references = findTypeReferences(spec, "client");
    expect(references.map((reference) => reference.owner)).toEqual(
      expect.arrayContaining(["type", "form", "workflow", "page"]),
    );

    const renamed = rewriteTypeReferences(spec, "client", "customer");
    expect(renamed.types.map((type) => type.key)).toEqual(["client", "project"]);
    expect(renamed.types[1]?.fields[0]?.target).toBe("customer");
    expect(renamed.forms[0]?.type).toBe("customer");
    expect(renamed.workflows[0]?.input?.client).toMatchObject({ record: "customer" });
    expect(renamed.workflows[0]?.trigger?.key).toBe("customer.name.changed");
    expect(JSON.stringify(renamed.workflows[0]?.steps)).toContain('"type":"customer"');
    expect(renamed.pages[1]?.blocks).toMatchObject([
      { values: { view: "customer_list" } },
      { values: { form: "customer_create" } },
    ]);
  });

  it("preserves conventional-looking keys once they are explicitly authored", () => {
    const spec = normalizeSpec({
      types: { project: { fields: { name: "text" } } },
      views: { project_list: { source: "project", fields: ["name"] } },
      forms: {
        project_create: { type: "project", fields: ["name"], mode: "create" },
      },
      pages: {
        overview: {
          blocks: [
            { kind: "widget", widget: "table", values: { view: "project_list" } },
            { kind: "widget", widget: "form", values: { form: "project_create" } },
          ],
        },
      },
    } as never);

    const renamed = rewriteTypeReferences(spec, "project", "engagement");
    expect(renamed.views[0]).toMatchObject({ key: "project_list", source: "engagement" });
    expect(renamed.forms[0]).toMatchObject({ key: "project_create", type: "engagement" });
    expect(renamed.pages[0]?.blocks).toMatchObject([
      { values: { view: "project_list" } },
      { values: { form: "project_create" } },
    ]);
  });
});
