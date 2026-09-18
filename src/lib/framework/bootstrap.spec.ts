import { describe, expect, it } from "vite-plus/test";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { createKernelSqlitePersistence } from "./sqlite.ts";
import {
  createApp,
  createSpace,
  deleteApp,
  emptySpec,
  listApps,
  openRuntime,
  renameApp,
  resolveApp,
  resolveSpace,
} from "./bootstrap.ts";
import type { Spec } from "@jthum/framework/spec";

function seed() {
  const spaceSpec: Spec = {
    ...emptySpec("space", "Space"),
    collections: [
      {
        id: "contact",
        key: "contact",
        label: "Contact",
        fields: [{ id: "contact_name", key: "name", label: "Name", type: "text", required: true }],
      },
    ],
  };
  const appSpec: Spec = {
    ...emptySpec("billing", "Billing"),
    sources: [{ id: "contact", key: "contact", label: "Contact" }],
    collections: [
      {
        id: "invoice",
        key: "invoice",
        label: "Invoice",
        fields: [
          { id: "number", key: "number", label: "Number", type: "text", required: true },
          {
            id: "invoice_contact",
            key: "contact",
            label: "Contact",
            type: "reference",
            sourceId: "contact",
          },
        ],
      },
    ],
    views: [
      {
        id: "invoices",
        key: "invoices",
        label: "Invoices",
        source: "invoice",
        query: {
          select: [
            { path: ["number"], as: "number" },
            { path: ["invoice_contact", "contact_name"], as: "contact_name" },
          ],
        },
      },
    ],
    forms: [
      {
        id: "create_invoice",
        key: "create_invoice",
        label: "Create Invoice",
        mode: "create",
        collectionId: "invoice",
        fieldIds: ["number", "invoice_contact"],
      },
    ],
    pages: [
      {
        id: "home",
        key: "home",
        label: "Home",
        layout: [{ id: "table", kind: "block", block: "table", config: { view: "invoices" } }],
      },
    ],
  };
  return { spaceName: "Space", appName: "Billing", user: { name: "Jane" }, spaceSpec, appSpec };
}
function persistence() {
  return createKernelSqlitePersistence(createNodeGateway());
}

describe("canonical local bootstrap", () => {
  it("runs S1 shared relations, Forms, Views and Pages and reopens the canonical stores", async () => {
    const adapter = persistence();
    const initialSeed = seed();
    const runtime = await openRuntime({ kernel: { persistence: adapter }, seed: initialSeed });
    expect(runtime.isNew).toBe(true);
    const contact = await runtime.spaceClient.createRecord("contact", { name: "Ada" });
    await runtime.appClient.submitForm("create_invoice", {
      values: { number: "INV-1", contact: contact.id },
    });
    expect((await runtime.appClient.queryView("invoices")).data.rows).toEqual([
      expect.objectContaining({ values: { number: "INV-1", contact_name: "Ada" } }),
    ]);
    expect(await runtime.appClient.getPage("home")).toMatchObject({ key: "home" });
    const notes = await createApp(runtime.kernel, runtime.spaceContext, {
      name: "Notes",
      spec: emptySpec("notes", "Notes"),
    });
    const renamed = await renameApp(runtime.kernel, notes, "Notebook");
    await runtime.kernel.close();
    const reopened = await openRuntime({
      kernel: { persistence: adapter },
      seed: initialSeed,
      preferredSelection: renamed.selection,
    });
    expect(reopened.app.name).toBe("Notebook");
    expect(reopened.selection).toEqual(notes.selection);
    const billing = await resolveApp(reopened.kernel, runtime.selection, runtime.actorId);
    expect(await billing.appClient.listRecords("invoice")).toHaveLength(1);
    expect(await billing.spaceClient.listRecords("contact")).toHaveLength(1);
    expect((await billing.appClient.getWorkspace()).spec).not.toHaveProperty("records");
    await reopened.kernel.close();
  });

  it("does not recreate deleted starter Apps and retains the final App", async () => {
    const adapter = persistence();
    const initialSeed = seed();
    const runtime = await openRuntime({ kernel: { persistence: adapter }, seed: initialSeed });
    const survivor = await createApp(runtime.kernel, runtime.spaceContext, {
      name: "Notes",
      spec: emptySpec("notes", "Notes"),
    });
    await deleteApp(runtime.kernel, runtime.spaceContext, runtime.app.id);
    await runtime.kernel.close();
    const reopened = await openRuntime({
      kernel: { persistence: adapter },
      seed: initialSeed,
      preferredSelection: runtime.selection,
    });
    expect(reopened.selection).toEqual(survivor.selection);
    expect(await listApps(reopened.kernel, reopened.spaceContext)).toHaveLength(1);
    await expect(
      deleteApp(reopened.kernel, reopened.spaceContext, survivor.app.id),
    ).rejects.toThrow("retain at least one App");
    await reopened.kernel.close();
  });

  it("creates independent Spaces with local issuance and switches without reopening the Kernel", async () => {
    const runtime = await openRuntime({ kernel: { persistence: persistence() }, seed: seed() });
    const other = await createSpace(runtime.kernel, {
      ...seed(),
      spaceName: "Studio",
      spaceSpec: emptySpec("studio", "Studio"),
      appSpec: emptySpec("home", "Home"),
    });
    expect(other.space).toMatchObject({ isRoot: true, parentId: null, rootId: other.space.id });
    expect(other.actorId).not.toBe(runtime.actorId);
    const selected = await resolveSpace(runtime.kernel, other.space.id, other.actorId);
    expect(selected.selection).toEqual(other.selection);
    const returned = await resolveSpace(runtime.kernel, runtime.space.id, runtime.actorId);
    expect(returned.actorId).toBe(runtime.actorId);
    const recruiting = await runtime.kernel.createWorkspace(runtime.spaceContext, {
      name: "Recruiting",
    });
    const candidate = await runtime.kernel.createActor(
      { workspaceId: recruiting.workspace.id, actorId: runtime.actorId },
      { name: "Candidate", kind: "user" },
    );
    expect(candidate.originId).toBe(recruiting.workspace.id);
    expect(
      (await runtime.kernel.listActorsByOrigin(runtime.spaceContext, runtime.space.id)).map(
        (actor) => actor.id,
      ),
    ).not.toContain(candidate.id);
    await expect(resolveApp(runtime.kernel, other.selection, runtime.actorId)).rejects.toThrow();
    await runtime.kernel.close();
  });

  it("cleans up a child App when its canonical Spec is invalid", async () => {
    const runtime = await openRuntime({ kernel: { persistence: persistence() }, seed: seed() });
    const before = await listApps(runtime.kernel, runtime.spaceContext);
    await expect(
      createApp(runtime.kernel, runtime.spaceContext, {
        name: "Invalid",
        spec: {
          ...emptySpec("bad", "Bad"),
          forms: [
            {
              id: "bad",
              key: "bad",
              label: "Bad",
              mode: "create",
              collectionId: "missing",
              fieldIds: [],
            },
          ],
        },
      }),
    ).rejects.toThrow();
    expect(await listApps(runtime.kernel, runtime.spaceContext)).toEqual(before);
    await runtime.kernel.close();
  });
});
