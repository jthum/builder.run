import { describe, expect, it } from "vite-plus/test";
import { normalizeSpec } from "$lib/runtime/model.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { openBuilderKernel, startBuilderKernel } from "./bootstrap.ts";
import { createKernelSqlitePersistence } from "./sqlite.ts";

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
    const gateway = createNodeGateway();
    const persistence = createKernelSqlitePersistence(gateway, "builder-slice-test");
    const seed = {
      spaceName: "Personal Space",
      appName: "Billing",
      user: { name: "Jane" },
      spaceSpec,
      appSpec,
      sharedTypes: [contact],
    };
    const instance = await startBuilderKernel({
      kernel: { persistence },
      seed,
    });

    expect(instance.created).toBe(true);
    expect(instance.gaps).toEqual([]);
    const ada = await instance.kernel.createRecord(instance.spaceContext, "contact", {
      name: "Ada",
    });
    const submitted = await instance.kernel.submitForm(instance.appContext, "create_invoice", {
      values: { number: "INV-1", contact: ada.id },
    });
    expect(submitted).toMatchObject({
      mode: "create",
      record: { values: { number: "INV-1", contact: ada.id } },
    });
    expect((await instance.kernel.queryView(instance.appContext, "invoices")).data.rows).toEqual([
      expect.objectContaining({ values: { number: "INV-1", contact_name: "Ada" } }),
    ]);
    expect(await instance.kernel.getPage(instance.appContext, "home")).toMatchObject({
      layout: [
        {
          kind: "group",
          children: [{ kind: "block", block: "table", config: { view: "invoices" } }],
        },
      ],
    });
    expect(await instance.kernel.listRecords(instance.spaceContext, "contact")).toHaveLength(1);
    expect(await instance.kernel.listRecords(instance.appContext, "invoice")).toHaveLength(1);
    await instance.kernel.close();

    const reopened = await startBuilderKernel({
      kernel: { persistence },
      seed,
    });
    expect(reopened.created).toBe(false);
    expect(await reopened.kernel.listRecords(reopened.spaceContext, "contact")).toHaveLength(1);
    expect(await reopened.kernel.listRecords(reopened.appContext, "invoice")).toHaveLength(1);
    expect(reopened.identity).toEqual(instance.identity);
    await reopened.kernel.close();

    await expect(
      openBuilderKernel({
        identity: { ...instance.identity, appId: instance.identity.spaceId },
        kernel: { persistence },
      }),
    ).rejects.toThrow("does not resolve to one Space and App");
    const recovered = await openBuilderKernel({
      identity: instance.identity,
      kernel: { persistence },
    });
    await recovered.kernel.close();
    await gateway.wipe();
  });
});
