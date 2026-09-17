import { describe, expect, it } from "vite-plus/test";
import { normalizeSpec } from "$lib/runtime/model.ts";
import { bootstrapBuilderFramework } from "./bootstrap.ts";

describe("Builder Framework vertical slice", () => {
  it("runs shared records, an app Form, View, and Page on the Framework Kernel", async () => {
    expect.hasAssertions();
    const spaceSpec = normalizeSpec({
      key: "personal_space",
      label: "Personal Space",
      types: {
        contact: {
          id: "A000000000000001",
          expose: true,
          fields: {
            name: { id: "A000000000000002", type: "text", required: true },
          },
        },
      },
    });
    const contact = spaceSpec.types[0]!;
    const appSpec = normalizeSpec({
      key: "billing",
      label: "Billing",
      types: {
        invoice: {
          id: "A000000000000003",
          fields: {
            number: { id: "A000000000000004", type: "text", required: true },
            contact: {
              id: "A000000000000005",
              type: "reference",
              target: "contact",
              required: true,
            },
          },
        },
      },
      views: {
        invoices: {
          id: "A000000000000006",
          source: "invoice",
          fields: ["number", "contact.name"],
        },
      },
      forms: {
        create_invoice: {
          id: "A000000000000007",
          mode: "create",
          type: "invoice",
          fields: ["number", "contact"],
        },
      },
      pages: {
        home: {
          id: "A000000000000008",
          blocks: [
            {
              kind: "group",
              columns: 1,
              blocks: [{ kind: "widget", widget: "table", values: { view: "invoices" } }],
            },
          ],
        },
      },
    });
    const host = await bootstrapBuilderFramework({
      spaceName: "Personal Space",
      appName: "Billing",
      user: { name: "Jane" },
      spaceSpec,
      appSpec,
      sharedTypes: [contact],
    });

    expect(host.gaps).toEqual([]);
    const ada = await host.kernel.createRecord(host.spaceContext, "contact", { name: "Ada" });
    const submitted = await host.kernel.submitForm(host.appContext, "create_invoice", {
      values: { number: "INV-1", contact: ada.id },
    });
    expect(submitted).toMatchObject({
      mode: "create",
      record: { values: { number: "INV-1", contact: ada.id } },
    });
    expect((await host.kernel.queryView(host.appContext, "invoices")).data.rows).toEqual([
      expect.objectContaining({ values: { number: "INV-1", contact_name: "Ada" } }),
    ]);
    expect(await host.kernel.getPage(host.appContext, "home")).toMatchObject({
      layout: [
        {
          kind: "group",
          children: [{ kind: "block", block: "table", config: { view: "invoices" } }],
        },
      ],
    });
    expect(await host.kernel.listRecords(host.spaceContext, "contact")).toHaveLength(1);
    expect(await host.kernel.listRecords(host.appContext, "invoice")).toHaveLength(1);
    await host.kernel.close();
  });
});
