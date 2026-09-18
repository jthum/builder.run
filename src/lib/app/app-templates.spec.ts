import { describe, expect, it } from "vite-plus/test";
import { openRuntime, listApps } from "$lib/framework/bootstrap.ts";
import { createKernelSqlitePersistence } from "$lib/framework/sqlite.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { emptySpec } from "$lib/framework/bootstrap.ts";
import { appTemplates } from "./templates/index.ts";
import { seedApp } from "./app-templates.ts";

describe("canonical App templates", () => {
  it("installs every template, reuses shared Collections, and seeds starter records", async () => {
    const runtime = await openRuntime({
      kernel: {
        persistence: createKernelSqlitePersistence(createNodeGateway(), "app-templates-test"),
      },
      seed: {
        spaceName: "Space",
        appName: "Home",
        user: { name: "Jane" },
        spaceSpec: emptySpec("space", "Space"),
        appSpec: emptySpec("home", "Home"),
      },
    });
    try {
      for (const sample of [...appTemplates, appTemplates[0]!]) {
        const before = await runtime.spaceClient.getWorkspace();
        const app = await seedApp(runtime, sample.label, sample.key);
        expect(app.app.name).toBe(sample.label);
        const space = await runtime.spaceClient.getWorkspace();
        for (const collection of before.spec.collections)
          expect(space.spec.collections.find((item) => item.key === collection.key)?.id).toBe(
            collection.id,
          );
        const shared = new Set((sample.sharedCollections ?? []).map((type) => type.key));
        for (const key of new Set((sample.records ?? []).map((record) => record.type))) {
          const client = shared.has(key) ? app.spaceClient : app.appClient;
          expect((await client.listRecords(key)).length).toBeGreaterThan(0);
        }
      }
      const apps = await listApps(runtime.kernel, runtime.spaceContext);
      expect(apps).toHaveLength(appTemplates.length + 2);
      expect(new Set(apps.map((app) => app.spec.id)).size).toBe(apps.length);
      const blank = await seedApp(runtime, "Notes");
      expect(blank.app.spec.collections).toEqual([]);
      await expect(seedApp(runtime, "Unknown", "missing")).rejects.toThrow("Unknown template");
    } finally {
      await runtime.kernel.close();
    }
  });
});
