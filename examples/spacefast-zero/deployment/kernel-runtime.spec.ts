import { describe, expect, it } from "vite-plus/test";
import { database } from "../testing/database.ts";
import { compileDeployment } from "./compile.ts";
import { fixture } from "./fixture.ts";
import { openKernelRuntime } from "./kernel-runtime.ts";
import { ZeroCatalogRepository } from "./catalog.ts";
import { ZeroRequestTransaction } from "./transaction.ts";

const identity = { subject: "native-owner", email: "owner@example.test", name: "Owner" };
const options = { writable: true, releaseId: "test-release", ownerEmail: identity.email };

describe("generated app Kernel integration", () => {
  it("persists Kernel-created records, validates fields and reopens the same authenticated Actor", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(1), "workspace");
      const runtime = await openKernelRuntime(
        db.install(deployment),
        deployment,
        identity,
        options,
      );
      const actor = runtime.context.actorId;
      const created = await runtime.client.createRecord("task", {
        title: "Ship",
        priority: 3,
        open: true,
      });
      expect(created.values.title).toBe("Ship");
      expect(created.createdBy).toBe(actor);
      await expect(
        runtime.client.createRecord("task", { title: "Invalid", priority: "wrong" }),
      ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
      expect((await runtime.client.queryView("ranked_tasks")).data.rows).toHaveLength(1);
      const submitted = await runtime.client.submitForm("new_task", {
        values: { title: "From form", priority: 4 },
      });
      expect(submitted.mode).toBe("create");
      const execution = await runtime.client.startRule("echo");
      expect(execution.status).toBe("completed");
      expect(execution.result).toBe("Ready");
      const waiting = await runtime.client.startRule("review");
      expect(waiting.status).toBe("waiting");
      await runtime.client.putSetting({ key: "ui.message", label: "Message", value: "Saved" });
      const member = await runtime.client.createMember({
        name: "Reader",
        email: "reader@example.test",
        permissions: ["read"],
      });
      expect(member.actor.email).toBe("reader@example.test");
      runtime.transaction.assertHealthy();
      await runtime.close();
      const reopened = await openKernelRuntime(db.install(deployment), deployment, identity, {
        ...options,
        writable: false,
      });
      expect(reopened.context.actorId).toBe(actor);
      expect((await reopened.client.getRecord("task", created.id))?.values.title).toBe("Ship");
      expect((await reopened.client.getSetting("ui.message"))?.value).toBe("Saved");
      db.traces.length = 0;
      expect(
        (await reopened.client.listRuleExecutions()).find((run) => run.id === execution.id)?.status,
      ).toBe("completed");
      expect(db.traces.every((query) => !query.includes("execution_bodies"))).toBe(true);
      expect(
        (await reopened.client.listMembers()).filter((member) => member.kind === "system"),
      ).toHaveLength(1);
      const request = (await reopened.client.listPendingActorRequests())[0]!;
      expect(request.executionId).toBe(waiting.id);
      await reopened.close();
      const updated = compileDeployment(fixture(2), "workspace").deployment;
      const redeployed = await openKernelRuntime(db.install(updated), updated, identity, options);
      expect((await redeployed.client.getRecord("task", created.id))?.values.name).toBe("Ship");
      expect((await redeployed.client.getWorkspace()).spec.collections[0]?.fields[0]?.key).toBe(
        "name",
      );
      expect(redeployed.context.actorId).toBe(actor);
      await redeployed.client.respondToActorRequest(waiting.id, request.id, { answer: "Approved" });
      expect((await redeployed.client.getRuleExecutionDetails(waiting.id))?.status).toBe(
        "completed",
      );
      expect(await redeployed.client.listPendingActorRequests()).toEqual([]);
      await redeployed.close();

      const reader = await openKernelRuntime(
        db.install(updated),
        updated,
        { subject: "native-reader", email: "reader@example.test", name: "Reader" },
        options,
      );
      expect((await reader.client.getRecord("task", created.id))?.id).toBe(created.id);
      await expect(
        reader.client.createRecord("task", { name: "Denied", priority: 3 }),
      ).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
      await reader.close();
      await expect(
        openKernelRuntime(
          db.install(updated),
          updated,
          { ...identity, subject: "uninvited", email: "stranger@example.test" },
          options,
        ),
      ).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    } finally {
      db.sql.close();
    }
  });

  it("resolves related Field paths through the Kernel's authorized query plan", async () => {
    const db = database();
    try {
      const base = fixture(1);
      const spec = {
        ...base,
        collections: [
          {
            ...base.collections[0]!,
            fields: [
              ...base.collections[0]!.fields,
              {
                id: "task_client",
                key: "client",
                label: "Client",
                type: "reference" as const,
                sourceId: "clients",
              },
            ],
          },
          {
            id: "clients",
            key: "client",
            label: "Client",
            fields: [
              {
                id: "client_name",
                key: "name",
                label: "Name",
                type: "text" as const,
                required: true,
              },
            ],
          },
        ],
        views: [
          ...base.views,
          {
            id: "client_tasks",
            key: "client_tasks",
            label: "Client tasks",
            source: "task",
            query: {
              filter: {
                path: ["task_client", "client_name"],
                operator: "eq" as const,
                value: "Acme",
              },
              select: [
                { path: ["task_title"], as: "title" },
                { path: ["task_client", "client_name"], as: "client_name" },
              ],
            },
          },
        ],
      };
      const deployment = compileDeployment(spec, "workspace").deployment;
      const runtime = await openKernelRuntime(
        db.install(deployment),
        deployment,
        identity,
        options,
      );
      const client = await runtime.client.createRecord("client", { name: "Acme" });
      const task = await runtime.client.createRecord("task", {
        title: "Related",
        priority: 1,
        client: client.id,
      });
      const result = await runtime.client.queryView("client_tasks");
      expect(result.data.rows).toEqual([
        { id: task.id, values: { title: "Related", client_name: "Acme" } },
      ]);
      await runtime.close();
    } finally {
      db.sql.close();
    }
  });

  it("discards rejected catalog callback writes and requires parent rollback after a failed native flush", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(1), "workspace");
      const native = db.install(deployment);
      const runtime = await openKernelRuntime(native, deployment, identity, options);
      const original = await runtime.session.catalog.getActor(runtime.context.actorId);
      const failure = new Error("Rejected callback");
      await expect(
        runtime.session.catalog.transaction(async (tx) => {
          await tx.updateActor({ ...original!, name: "Must not persist" });
          expect((await tx.getActor(original!.id))?.name).toBe("Must not persist");
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect((await runtime.session.catalog.getActor(original!.id))?.name).toBe("Owner");
      runtime.transaction.assertHealthy();
      await runtime.close();

      db.sql.exec("BEGIN");
      const broken = {
        ...native,
        catalog_objects: {
          ...native.catalog_objects!,
          update: async () => {
            throw new Error("Native storage failure");
          },
        },
      };
      const transaction = new ZeroRequestTransaction(broken);
      const catalog = new ZeroCatalogRepository(transaction.db);
      await expect(
        catalog.transaction((tx) =>
          tx.updateActor({ ...original!, name: "Also must not persist" }),
        ),
      ).rejects.toThrow("Native storage failure");
      expect(() => transaction.assertHealthy()).toThrow("Native storage failure");
      db.sql.exec("ROLLBACK");
      expect((await new ZeroCatalogRepository(native).getActor(original!.id))?.name).toBe("Owner");
    } finally {
      db.sql.close();
    }
  });
});
