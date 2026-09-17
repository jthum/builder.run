import { Kernel } from "@jthum/framework/kernel";
import { describe, expect, it } from "vite-plus/test";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { createKernelSqlitePersistence } from "./sqlite.ts";

describe("Framework SQLite persistence", () => {
  it("persists the Framework catalog and records through Builder's gateway", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const persistence = createKernelSqlitePersistence(gateway);
    const first = await Kernel.open({ persistence });
    const bootstrap = await first.createRootWorkspace({
      name: "Personal Space",
      user: { name: "Jane" },
    });
    const context = {
      workspaceId: bootstrap.workspace.id,
      actorId: bootstrap.user.id,
    };
    await first.applySpec(context, {
      id: "A000000000000001",
      key: "personal_space",
      label: "Personal Space",
      version: 2,
      collections: [
        {
          id: "A000000000000002",
          key: "contact",
          label: "Contact",
          fields: [
            {
              id: "A000000000000003",
              key: "name",
              label: "Name",
              type: "text",
              required: true,
            },
          ],
        },
      ],
      sources: [],
      views: [],
      forms: [],
      pages: [],
      rules: [],
    });
    const record = await first.createRecord(context, "contact", { name: "Ada" });
    await first.close();

    const second = await Kernel.open({ persistence });
    expect(await second.getWorkspace(context)).toMatchObject({
      name: "Personal Space",
    });
    expect(await second.getRecord(context, "contact", record.id)).toMatchObject({
      values: { name: "Ada" },
    });
    await second.close();
    await gateway.wipe();
  });

  it("rolls back the whole framework transaction when work fails", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const persistence = createKernelSqlitePersistence(gateway, "rollback-test");
    const session = await persistence.open();

    await expect(
      session.catalog.transaction(async (transaction) => {
        await transaction.insertWorkspace({
          id: "A000000000000004",
          isRoot: true,
          parentId: null,
          rootId: "A000000000000004",
          name: "Rolled back",
          spec: {
            id: "A000000000000005",
            key: "rolled_back",
            label: "Rolled back",
            version: 2,
            collections: [],
            sources: [],
            views: [],
            forms: [],
            pages: [],
            rules: [],
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    expect(await session.catalog.getWorkspace("A000000000000004")).toBeNull();

    await session.close();
    await gateway.wipe();
  });

  it("owns one active gateway session and can reopen after close", async () => {
    expect.hasAssertions();
    const gateway = createNodeGateway();
    const persistence = createKernelSqlitePersistence(gateway, "session-test");
    const competing = createKernelSqlitePersistence(gateway, "session-test");
    const first = await persistence.open();

    await expect(competing.open()).rejects.toThrow("already has an active session");
    await first.close();

    const second = await persistence.open();
    await expect(second.catalog.listRootWorkspaces()).resolves.toEqual([]);
    await second.close();
    await gateway.wipe();
  });
});
