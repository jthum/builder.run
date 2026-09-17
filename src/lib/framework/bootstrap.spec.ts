import { describe, expect, it } from "vite-plus/test";
import { normalizeSpec } from "$lib/runtime/model.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { Kernel } from "@jthum/framework/kernel";
import { openBuilderKernel, resolveBuilderApp } from "./bootstrap.ts";
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
    const instance = await openBuilderKernel({
      kernel: { persistence },
      seed,
    });

    expect(instance.isNew).toBe(true);
    if (!instance.isNew) throw new Error("Expected a newly seeded Builder Kernel");
    expect(instance.gaps).toEqual([]);
    const ada = await instance.spaceClient.createRecord("contact", {
      name: "Ada",
    });
    const submitted = await instance.appClient.submitForm("create_invoice", {
      values: { number: "INV-1", contact: ada.id },
    });
    expect(submitted).toMatchObject({
      mode: "create",
      record: { values: { number: "INV-1", contact: ada.id } },
    });
    expect((await instance.appClient.queryView("invoices")).data.rows).toEqual([
      expect.objectContaining({ values: { number: "INV-1", contact_name: "Ada" } }),
    ]);
    expect(await instance.appClient.getPage("home")).toMatchObject({
      layout: [
        {
          kind: "group",
          children: [{ kind: "block", block: "table", config: { view: "invoices" } }],
        },
      ],
    });
    expect(await instance.spaceClient.listRecords("contact")).toHaveLength(1);
    expect(await instance.appClient.listRecords("invoice")).toHaveLength(1);
    await instance.kernel.close();

    const reopened = await openBuilderKernel({
      kernel: { persistence },
      seed,
    });
    expect(reopened.isNew).toBe(false);
    expect(await reopened.spaceClient.listRecords("contact")).toHaveLength(1);
    expect(await reopened.appClient.listRecords("invoice")).toHaveLength(1);
    expect(reopened.selection).toEqual(instance.selection);
    expect(reopened.actorId).toBe(instance.actorId);
    await reopened.kernel.close();

    const serverKernel = await Kernel.open({ persistence });
    await expect(
      resolveBuilderApp(
        serverKernel,
        { ...instance.selection, appId: instance.selection.spaceId },
        instance.actorId,
      ),
    ).rejects.toThrow("does not resolve to one Space and App");
    const recovered = await resolveBuilderApp(serverKernel, instance.selection, instance.actorId);
    expect(recovered.selection).toEqual(instance.selection);
    expect((await recovered.appClient.queryView("invoices")).data.rows).toHaveLength(1);
    await serverKernel.close();
    await gateway.wipe();
  });

  it("validates a seed before writing a partial topology", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const persistence = createKernelSqlitePersistence(gateway, "invalid-seed-test");
    const contact = normalizeSpec({
      key: "shared",
      types: { contact: { fields: { name: "text" } } },
    }).types[0]!;

    await expect(
      openBuilderKernel({
        kernel: { persistence },
        seed: {
          spaceName: "Personal Space",
          appName: "Empty",
          user: { name: "Jane" },
          spaceSpec: normalizeSpec({ key: "personal_space" }),
          appSpec: normalizeSpec({ key: "empty" }),
          sharedTypes: [contact],
        },
      }),
    ).rejects.toThrow("must project from the Space into the App");

    const session = await persistence.open();
    await expect(session.catalog.listRootWorkspaces()).resolves.toEqual([]);
    await session.close();
    await gateway.wipe();
  });
});
