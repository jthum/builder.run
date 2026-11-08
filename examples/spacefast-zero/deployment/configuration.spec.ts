import { describe, expect, it } from "vite-plus/test";
import {
  EMPTY_WORKSPACE_CONFIG,
  type ScopeConfig,
  type WorkspaceConfig,
} from "@jthum/framework/kernel";
import { compileDeployment } from "./compile.ts";
import { fixture } from "./fixture.ts";
import { ZeroScopeStore, ZeroWorkspaceConfigStore } from "./configuration.ts";
import { database } from "../testing/database.ts";

describe("Zero instance configuration", () => {
  it("persists detached settings, sealed secrets, Actions and Actor bindings across handles", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(1), "workspace");
      const native = db.install(deployment);
      const first = new ZeroWorkspaceConfigStore(native, "workspace");
      expect(await first.get("workspace")).toEqual(EMPTY_WORKSPACE_CONFIG);
      const initial: WorkspaceConfig = {
        settings: [
          {
            key: "personality.humour",
            label: "Humour",
            category: "agents/personality",
            value: 0.5,
          },
          {
            key: "provider.key",
            label: "API key",
            secret: true,
            maskedValue: "••••1234",
            encrypted: {
              version: 1,
              algorithm: "AES-GCM",
              iv: "test-iv",
              ciphertext: "test-sealed-value",
            },
          },
        ],
        actions: [
          {
            key: "custom.search",
            label: "Search",
            description: "Search the configured provider",
            input: { type: "object", properties: {} },
            implementation: { kind: "host", config: { provider: "example" } },
          },
        ],
        actorBindings: [{ key: "reviewer", actorId: "reviewer-id" }],
      };
      const saved = await first.update("workspace", () => initial);
      (saved.settings[0] as { value: number }).value = 999;
      const reopened = new ZeroWorkspaceConfigStore(db.install(deployment), "workspace");
      expect(await reopened.get("workspace")).toEqual(initial);
      expect(db.sql.prepare("SELECT COUNT(*) AS n FROM workspace_config").get()?.n).toBe(1);
      await expect(reopened.get("other")).rejects.toMatchObject({ code: "RESOURCE.NOT_FOUND" });
    } finally {
      db.sql.close();
    }
  });

  it("serializes same-request callback updates and leaves storage intact after a rejected callback", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(1), "workspace");
      const store = new ZeroWorkspaceConfigStore(db.install(deployment), "workspace");
      const add = (key: string) =>
        store.update("workspace", (current) => ({
          ...current,
          actorBindings: [...current.actorBindings, { key, actorId: key }],
        }));
      await Promise.all([add("first"), add("second")]);
      expect((await store.get("workspace")).actorBindings.map((binding) => binding.key)).toEqual([
        "first",
        "second",
      ]);
      const failure = new Error("Intentional rejected change");
      await expect(
        store.update("workspace", () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      await add("third");
      expect((await store.get("workspace")).actorBindings).toHaveLength(3);
      expect(db.sql.prepare("SELECT COUNT(*) AS n FROM workspace_config").get()?.n).toBe(1);
    } finally {
      db.sql.close();
    }
  });

  it("isolates scope kind, scope ID and Workspace and preserves configuration through a model redeploy", async () => {
    const db = database();
    try {
      const { deployment } = compileDeployment(fixture(1), "workspace");
      const scopes = new ZeroScopeStore(db.install(deployment), "workspace");
      const channel = { kind: "channel", id: "same-id" };
      const topic = { kind: "topic", id: "same-id" };
      const config: ScopeConfig = { collections: [], views: [], forms: [], pages: [], rules: [] };
      await scopes.set("workspace", channel, config);
      await scopes.set("workspace", topic, {
        ...config,
        pages: [{ id: "page", key: "overview", label: "Overview", layout: [] }],
      });
      const other = new ZeroScopeStore(
        db.install({ ...deployment, workspaceId: "other" }),
        "other",
      );
      await other.set("other", channel, config);
      expect(await scopes.get("workspace", { kind: "channel", id: "missing" })).toBeNull();
      expect((await scopes.get("workspace", topic))?.pages).toHaveLength(1);
      const next = compileDeployment(fixture(2), "workspace").deployment;
      const reopened = new ZeroScopeStore(db.install(next), "workspace");
      db.traces.length = 0;
      expect(await reopened.list("workspace")).toHaveLength(2);
      expect(db.traces[0]).toContain('WHERE "workspace" = ?');
      await reopened.delete("workspace", channel);
      await reopened.delete("workspace", channel);
      expect(await reopened.get("workspace", channel)).toBeNull();
      expect(await other.get("other", channel)).toEqual(config);
      expect(await reopened.list("workspace")).toHaveLength(1);
    } finally {
      db.sql.close();
    }
  });
});
