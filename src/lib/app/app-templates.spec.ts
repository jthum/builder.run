import { describe, expect, it, vi } from "vite-plus/test";
import { openRuntime, listApps } from "$lib/framework/bootstrap.ts";
import { createKernelSqlitePersistence } from "$lib/framework/sqlite.ts";
import { createNodeGateway } from "$lib/runtime/persistence/sqlite/node-gateway.ts";
import { emptySpec } from "$lib/framework/bootstrap.ts";
import { appTemplateCatalog, appTemplates, officialAppTemplateSource } from "./templates/index.ts";
import { seedApp, instantiateDefinitions } from "./app-templates.ts";

describe("canonical App templates", () => {
  it("discovers official templates through the host-selected catalog", () => {
    const discovered = appTemplateCatalog.list({ sourceKeys: ["official"], category: "projects" });

    expect(appTemplateCatalog.sources()).toEqual([
      expect.objectContaining({ key: "official", label: "Official" }),
    ]);
    expect(discovered.items.map(({ entry }) => entry.key)).toEqual(
      officialAppTemplateSource.entries
        .filter((entry) => entry.category === "projects")
        .map((entry) => entry.key),
    );
  });

  it("removes a newly created App on seeding failure without rolling back shared data", async () => {
    const runtime = await openRuntime({
      kernel: {
        persistence: createKernelSqlitePersistence(createNodeGateway(), "failed-template-test"),
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
      const before = await listApps(runtime.kernel, runtime.spaceContext);
      const create = runtime.kernel.createRecord.bind(runtime.kernel);
      let localWrites = 0;
      vi.spyOn(runtime.kernel, "createRecord").mockImplementation(async (context, key, values) => {
        if (context.workspaceId !== runtime.space.id && ++localWrites === 2)
          throw new Error("Injected seed failure");
        return create(context, key, values);
      });
      const sample = appTemplates[0]!;
      await expect(seedApp(runtime, "Incomplete", sample.key)).rejects.toThrow(
        "Injected seed failure",
      );
      expect(await listApps(runtime.kernel, runtime.spaceContext)).toEqual(before);
      const space = await runtime.spaceClient.getWorkspace();
      for (const collection of sample.sharedCollections) {
        expect(space.spec.collections.some((item) => item.key === collection.key)).toBe(true);
        expect((await runtime.spaceClient.listRecords(collection.key)).length).toBeGreaterThan(0);
      }
      expect((await runtime.appClient.getWorkspace()).spec.key).toBe("home");
    } finally {
      await runtime.kernel.close();
    }
  });
  it("refreshes stable Rule references and Field-keyed Action inputs without rewriting opaque data", () => {
    const meta = { id: "field", sourceId: "collection" };
    const value = instantiateDefinitions({
      collections: [{ id: "collection", fields: [{ id: "field", meta }] }],
      rules: [
        {
          id: "rule",
          input: { record: { sourceId: "collection" } },
          steps: [
            {
              id: "step",
              action: {
                key: "records.update",
                input: {
                  record: { $ref: "vars.record" },
                  values: { field: { value: meta } },
                },
              },
            },
          ],
        },
      ],
      config: meta,
    });
    const collection = value.collections[0]!;
    const rule = value.rules[0]!;
    expect(collection.id).not.toBe("collection");
    expect(rule.input.record.sourceId).toBe(collection.id);
    expect(Object.keys(rule.steps[0]!.action.input.values)).toEqual([collection.fields[0]!.id]);
    expect(Object.values(rule.steps[0]!.action.input.values)).toEqual([{ value: meta }]);
    expect(collection.fields[0]!.meta).toEqual(meta);
    expect(value.config).toEqual(meta);
  });
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
        for (const view of app.app.spec.views)
          expect((await app.appClient.queryView(view.key)).data.rows).toBeInstanceOf(Array);
        for (const key of new Set((sample.records ?? []).map((record) => record.type))) {
          const client = shared.has(key) ? app.spaceClient : app.appClient;
          expect((await client.listRecords(key)).length).toBeGreaterThan(0);
        }
        const manual = app.app.spec.rules.find(
          (rule) => !rule.trigger && rule.expose?.includes("ui"),
        );
        if (manual) {
          const input: Record<string, string> = {};
          for (const [key, definition] of Object.entries(manual.input ?? {})) {
            if (!("sourceId" in definition)) continue;
            const source = [...app.app.spec.collections, ...app.app.spec.sources].find(
              (item) => item.id === definition.sourceId,
            )!;
            const records = await app.appClient.querySource(source.key);
            input[key] = records.rows[0]!.id;
          }
          expect(await app.appClient.runRule(manual.key, { input })).toMatchObject({
            status: "completed",
          });
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
