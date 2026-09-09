import { describe, expect, it } from "vite-plus/test";
import { isSpecId } from "./ids.ts";
import { normalizeSpec } from "./model.ts";
import { specFromText, specToJson } from "./serialize.ts";

describe("portable spec identity and metadata", () => {
  it("generates one bare globally unique shape for durable spec nodes", () => {
    const spec = exampleSpec();
    const ids = [
      ...spec.stores.map((item) => item.id),
      ...spec.types.flatMap((item) => [item.id, ...item.fields.map((field) => field.id)]),
      ...spec.views.map((item) => item.id),
      ...spec.forms.map((item) => item.id),
      ...spec.workflows.map((item) => item.id),
      ...spec.pages.map((item) => item.id),
    ];

    expect(ids.every(isSpecId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => !id.includes("_"))).toBe(true);
  });

  it("preserves uninterpreted JSON metadata across every durable spec item", () => {
    const source = exampleSpec();
    const restored = specFromText(specToJson(source));

    expect(restored.meta).toEqual({ owner: "portable" });
    expect(restored.stores[0].meta).toEqual({ adapter: { cache: true } });
    expect(restored.types[0].meta).toEqual({ wordpress: { post_type: "task" } });
    expect(restored.types[0].fields[0].meta).toEqual({ native: ["title"] });
    expect(restored.views[0].meta).toEqual({ layout: null });
    expect(restored.forms[0].meta).toEqual({ channel: "public" });
    expect(restored.workflows[0].meta).toEqual({ queue: { name: "default" } });
    expect(restored.pages[0].meta).toEqual({ shell: "main" });
  });

  it("uses identity to reconcile renamed types and fields", () => {
    const original = normalizeSpec({
      types: {
        task: {
          label: "Task",
          meta: { source: "original" },
          fields: { title: { type: "text", label: "Title" } },
        },
      },
    });
    const typeId = original.types[0].id;
    const fieldId = original.types[0].fields[0].id;

    const renamed = normalizeSpec(
      {
        types: {
          work_item: {
            id: typeId,
            fields: { subject: { id: fieldId, type: "text" } },
          },
        },
      },
      original,
    );

    expect(renamed.types[0]).toMatchObject({
      id: typeId,
      key: "work_item",
      label: "Task",
      meta: { source: "original" },
    });
    expect(renamed.types[0].fields[0]).toMatchObject({
      id: fieldId,
      key: "subject",
      label: "Title",
    });
  });

  it("rejects legacy spec ids and non-JSON metadata", () => {
    expect(() => normalizeSpec({ types: { task: { id: "typ_task", fields: {} } } })).toThrow(
      "16-character base-62 id",
    );
    expect(() => normalizeSpec({ meta: { invalid: undefined } } as never)).toThrow(
      "JSON-compatible values",
    );
    expect(() => normalizeSpec({ flows: {} } as never)).toThrow('Unknown spec property "flows"');
  });

  it("rejects duplicate identities across different spec kinds", () => {
    expect(() =>
      normalizeSpec({
        types: { task: { id: "A000000000000001", fields: {} } },
        views: { tasks: { id: "A000000000000001", source: "task", fields: [] } },
      }),
    ).toThrow("Duplicate spec id");
  });
});

function exampleSpec() {
  return normalizeSpec({
    key: "tasks",
    label: "Tasks",
    meta: { owner: "portable" },
    stores: { local: { label: "App", kind: "local", meta: { adapter: { cache: true } } } },
    types: {
      task: {
        label: "Task",
        meta: { wordpress: { post_type: "task" } },
        fields: {
          title: { type: "text", meta: { native: ["title"] } },
        },
      },
    },
    views: {
      tasks: { source: "task", fields: ["title"], meta: { layout: null } },
    },
    forms: {
      task: { type: "task", fields: ["title"], mode: "create", meta: { channel: "public" } },
    },
    workflows: {
      announce: { steps: [], meta: { queue: { name: "default" } } },
    },
    pages: {
      home: { blocks: [], meta: { shell: "main" } },
    },
  });
}
