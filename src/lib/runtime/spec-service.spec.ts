import { describe, expect, it } from "vite-plus/test";
import { effectiveSpec } from "./defaults.ts";
import { newAppSpec, rootSpaceSpec } from "./samples.ts";
import { SpecService, type SpecChange } from "./spec-service.ts";
import type { SpaceState } from "./platform.ts";

describe("SpecService", () => {
  it("authors and rewrites a spec without a persistence runtime", async () => {
    expect.hasAssertions();
    const space: SpaceState = {
      id: "space",
      name: "Personal Space",
      actors: [],
      spec: rootSpaceSpec("Personal Space"),
    };
    const app: SpaceState = {
      id: "app",
      name: "Test app",
      createdBy: "actor",
      actors: [],
      spec: newAppSpec("test_app", "Test app"),
    };
    let commits = 0;
    const service = new SpecService({
      app: () => app,
      space: () => space,
      apps: () => [app],
      resolvedSpec: () => effectiveSpec(app.spec),
      commit: async (changes: SpecChange[]) => {
        commits += 1;
        for (const change of changes) {
          const owner = change.id === app.id ? app : change.id === space.id ? space : undefined;
          if (!owner) throw new Error(`Unknown owner ${change.id}`);
          owner.spec = change.spec;
        }
      },
    });

    const type = await service.upsertType({ key: "request", fields: { title: "text" } });
    await service.upsertView({ key: "open_requests", source: "request", fields: ["title"] });
    const renamed = await service.renameField("request", "title", "subject");

    expect(type.id).toHaveLength(16);
    expect(renamed.id).toBe(type.fields[0]?.id);
    expect(app.spec.views.find((view) => view.key === "open_requests")?.fields).toEqual([
      "subject",
    ]);
    expect(commits).toBe(3);
  });
});
