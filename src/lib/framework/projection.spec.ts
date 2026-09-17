import { describe, expect, it } from "vite-plus/test";
import type { AppSpec, TypeDef } from "$lib/runtime/model.ts";
import { sampleApps } from "$lib/runtime/samples.ts";
import { assertFrameworkProjectionReady, projectFrameworkSpec } from "./projection.ts";

describe("Framework projection", () => {
  it("projects local and shared information-system surfaces without copying shared Collections", () => {
    expect.hasAssertions();
    const contact = contactType();
    const input = appSpec(contact);
    const projection = projectFrameworkSpec(input, { sharedTypes: [contact] });

    expect(projection.gaps).toEqual([]);
    expect(projection.spec.collections.map((collection) => collection.key)).toEqual(["invoice"]);
    expect(projection.spec.sources).toEqual([
      expect.objectContaining({ id: "type-contact", key: "contact" }),
    ]);
    expect(projection.spec.collections[0]?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "contact", type: "reference", sourceId: "type-contact" }),
        expect.objectContaining({ key: "status", type: "choice" }),
      ]),
    );
    expect(projection.spec.forms).toEqual([
      expect.objectContaining({
        mode: "create",
        collectionId: "type-invoice",
        fieldIds: ["field-number", "field-contact"],
      }),
    ]);
    expect(projection.spec.pages[0]).toMatchObject({
      meta: { icon: "home", folder: "Overview" },
      layout: [
        {
          kind: "group",
          children: [{ kind: "block", block: "table", config: { view: "invoice_list" } }],
        },
      ],
    });
    expect(assertFrameworkProjectionReady(projection)).toBe(projection.spec);
  });

  it("projects grouped measures and structured Rules", () => {
    expect.hasAssertions();
    const contact = contactType();
    const input = appSpec(contact);
    input.views[0] = {
      ...input.views[0]!,
      group_by: "status",
      measures: { total: { op: "count" } },
    };
    input.workflows = [
      {
        id: "workflow-notify",
        key: "notify",
        label: "Notify",
        enabled: true,
        priority: 0,
        steps: [],
      },
    ];

    const projection = projectFrameworkSpec(input, { sharedTypes: [contact] });
    expect(projection.gaps).toEqual([]);
    expect(projection.spec.views[0]).toMatchObject({
      query: {
        aggregate: {
          group: { path: ["field-status"], as: "status" },
          measures: [{ as: "total", operation: "count" }],
        },
      },
    });
    expect(projection.spec.rules[0]).toMatchObject({
      id: "workflow-notify",
      key: "notify",
      enabled: true,
      steps: [],
    });
    expect(assertFrameworkProjectionReady(projection)).toBe(projection.spec);
  });

  it("projects every current template and reports only deliberate phase gaps", () => {
    expect.hasAssertions();
    for (const sample of sampleApps) {
      const projection = projectFrameworkSpec(sample.spec, {
        sharedTypes: sample.exposedTypes ?? [],
      });
      expect(projection.gaps, sample.key).toEqual([]);
      expect(projection.spec.key).toBe(sample.spec.key);
    }
  });
});

function contactType(): TypeDef {
  return {
    id: "type-contact",
    key: "contact",
    label: "Contact",
    store: "local",
    expose: true,
    fields: [{ id: "field-contact-name", key: "name", label: "Name", type: "text" }],
  };
}

function appSpec(contact: TypeDef): AppSpec {
  return {
    id: "spec-billing",
    version: 1,
    key: "billing",
    label: "Billing",
    stores: [{ id: "store-local", key: "local", label: "App", kind: "local" }],
    types: [
      contact,
      {
        id: "type-invoice",
        key: "invoice",
        label: "Invoice",
        store: "local",
        fields: [
          { id: "field-number", key: "number", label: "Number", type: "text", required: true },
          {
            id: "field-contact",
            key: "contact",
            label: "Contact",
            type: "reference",
            target: "contact",
          },
          {
            id: "field-status",
            key: "status",
            label: "Status",
            type: "enum",
            values: ["draft", "paid"],
          },
        ],
      },
    ],
    views: [
      {
        id: "view-invoices",
        key: "invoice_list",
        label: "Invoices",
        source: "invoice",
        fields: ["number", "contact.name", "status"],
        where: [{ field: "status", op: "neq", value: "paid" }],
        order_by: { number: "asc" },
      },
    ],
    forms: [
      {
        id: "form-create-invoice",
        key: "create_invoice",
        label: "Create invoice",
        mode: "create",
        type: "invoice",
        fields: ["number", "contact"],
      },
    ],
    workflows: [],
    pages: [
      {
        id: "page-home",
        key: "home",
        label: "Home",
        icon: "home",
        folder: "Overview",
        blocks: [
          {
            id: "block-home-grid",
            kind: "group",
            columns: 1,
            blocks: [
              {
                id: "block-invoice-table",
                kind: "block",
                block: "table",
                config: { view: "invoice_list" },
              },
            ],
          },
        ],
      },
    ],
  };
}
