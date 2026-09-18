import { Kernel } from "@jthum/framework/kernel";
import { describe, expect, it } from "vite-plus/test";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import {
  createKernelSqlitePersistence,
  CATALOG_DATABASE,
  scopeDatabaseName,
  workspaceDatabaseName,
} from "./sqlite.ts";

describe("Framework SQLite persistence", () => {
  it("uses compact, stable names for routed databases", () => {
    const workspace = workspaceDatabaseName("H0GLM4X_ozqrtEfe0QwwA");
    const scope = scopeDatabaseName(
      "H0GLM4X_ozqrtEfe0QwwA",
      "data",
      "a-scope-identity-that-may-be-considerably-longer-than-a-workspace-id",
    );

    expect(workspace).toBe(workspaceDatabaseName("H0GLM4X_ozqrtEfe0QwwA"));
    expect(scope).not.toBe(workspace);
    expect(workspace.length).toBeLessThanOrEqual(56);
    expect(scope.length).toBeLessThanOrEqual(56);
  });

  it("persists the Framework catalog and records through the application gateway", async () => {
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
    const { workspace: app } = await first.createWorkspace(context, { name: "CRM" });
    const appContext = { ...context, workspaceId: app.id };
    await first.applySpec(appContext, {
      ...app.spec,
      collections: [
        {
          id: "A000000000000002",
          key: "contact",
          label: "App contact",
          fields: [
            {
              id: "A000000000000003",
              key: "name",
              label: "Name",
              type: "text",
            },
          ],
        },
      ],
    });
    const appRecord = await first.createRecord(appContext, "contact", { name: "Grace" });
    const catalog = await gateway.open(CATALOG_DATABASE);
    expect(await catalog.query("SELECT collection_id FROM framework_record_schemas")).toEqual([]);
    await catalog.close();
    const workspaceDatabase = await gateway.open(workspaceDatabaseName(context.workspaceId));
    expect(
      await workspaceDatabase.query("SELECT collection_id FROM framework_record_schemas"),
    ).toEqual([{ collection_id: "A000000000000002" }]);
    await workspaceDatabase.close();
    const appDatabase = await gateway.open(workspaceDatabaseName(app.id));
    expect(await appDatabase.query("SELECT collection_id FROM framework_record_schemas")).toEqual([
      { collection_id: "A000000000000002" },
    ]);
    await appDatabase.close();
    await expect(gateway.inspect()).resolves.toMatchObject({
      databases: expect.arrayContaining([
        expect.objectContaining({ name: CATALOG_DATABASE }),
        expect.objectContaining({ name: workspaceDatabaseName(context.workspaceId) }),
        expect.objectContaining({ name: workspaceDatabaseName(app.id) }),
      ]),
    });
    await first.close();

    const second = await Kernel.open({ persistence });
    expect(await second.getWorkspace(context)).toMatchObject({
      name: "Personal Space",
    });
    expect(await second.getRecord(context, "contact", record.id)).toMatchObject({
      values: { name: "Ada" },
    });
    expect(await second.getRecord(appContext, "contact", appRecord.id)).toMatchObject({
      values: { name: "Grace" },
    });
    await second.close();
    await gateway.wipe();
  });

  it("removes one logical database without wiping its siblings", async () => {
    const gateway = createNodeGateway();
    const retained = await gateway.open("retained.db");
    await retained.exec("CREATE TABLE marker (id TEXT)");
    await retained.close();
    const removed = await gateway.open("removed.db");
    await removed.exec("CREATE TABLE marker (id TEXT)");
    await removed.close();
    await gateway.remove("removed.db");
    const reopened = await gateway.open("removed.db");
    expect(await reopened.query("SELECT name FROM sqlite_master WHERE name = 'marker'")).toEqual(
      [],
    );
    await reopened.close();
    const stillThere = await gateway.open("retained.db");
    expect(await stillThere.query("SELECT name FROM sqlite_master WHERE name = 'marker'")).toEqual([
      { name: "marker" },
    ]);
    await stillThere.close();
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
          access: {
            members: ["read", "create", "update", "delete", "manage"],
            others: [],
          },
          policy: { spawn: true, createActors: true, reshare: false },
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
