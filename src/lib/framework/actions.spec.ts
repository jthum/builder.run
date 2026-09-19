import { describe, expect, it } from "vite-plus/test";
import { Kernel } from "@jthum/framework/kernel";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import { browserSecrets, delegateAction } from "./actions.ts";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("Browser Action integration", () => {
  it("stores masked secrets and delegates to the configured Action in an app Workspace", async () => {
    const browserStorage = storage();
    const kernel = await Kernel.open({
      persistence: new MemoryPersistenceAdapter(),
      secrets: browserSecrets(browserStorage),
      actionExecutors: [delegateAction],
      actions: [{ key: "test.provider", run: ({ input }) => ({ handled: input.query ?? null }) }],
    });
    const root = await kernel.createRootWorkspace({ name: "Space", user: { name: "Jane" } });
    const space = { workspaceId: root.workspace.id, actorId: root.user.id };
    const app = await kernel.createWorkspace(space, { name: "App" });
    const context = { ...space, workspaceId: app.workspace.id };
    try {
      await kernel.putSetting(context, {
        key: "search_provider",
        label: "Provider",
        value: "test.provider",
      });
      await kernel.putSetting(context, {
        key: "api_key",
        label: "API key",
        secret: true,
        value: "private",
      });
      await kernel.putRuntimeAction(context, {
        key: "web.search",
        label: "Search",
        description: "Delegated search",
        input: { type: "object", additionalProperties: true },
        implementation: { kind: "delegate", config: { settingKey: "search_provider" } },
        tool: { availability: "discoverable" },
      });
      expect(await kernel.executeAction(context, "web.search", { query: "test" })).toEqual({
        handled: "test",
      });
      expect(JSON.stringify(await kernel.listSettings(context))).not.toContain("private");
      expect(browserStorage.length).toBe(1);
      await kernel.deleteSetting(context, "api_key");
      expect(browserStorage.length).toBe(0);
    } finally {
      await kernel.close();
    }
  });
});
