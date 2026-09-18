import { createEmptySpec } from "@jthum/framework/spec";
import { describe, expect, it } from "vite-plus/test";
import type { ToolContext } from "$lib/app/webmcp.ts";
import { createAuthoringInferenceTools } from "./authoring-tools.ts";

describe("authoring inference tools", () => {
  it("reuses the Builder tool surface with compact contextual discovery", async () => {
    const spec = createEmptySpec({ id: "spec", key: "test", label: "Test" });
    const unavailable = () => {
      throw new Error("not executed");
    };
    const provider = createAuthoringInferenceTools({
      runtime: unavailable,
      spec: () => spec,
      changed: async () => undefined,
      createApp: unavailable,
      selectApp: unavailable,
      deleteApp: unavailable,
      createSpace: unavailable,
    } satisfies ToolContext);

    const tools = await provider.resolve({} as never);
    expect(tools.find((tool) => tool.id === "builder:get_spec")?.availability).toBe("eager");
    expect(tools.find((tool) => tool.id === "builder:upsert_collection")?.availability).toBe(
      "discoverable",
    );
    expect(tools.some((tool) => tool.id === "builder:create_app")).toBe(false);
    expect(tools.every((tool) => tool.id.startsWith("builder:"))).toBe(true);
  });

  it("describes Collection fields precisely and generates stable IDs for new definitions", async () => {
    let spec = createEmptySpec({ id: "spec", key: "test", label: "Test" });
    const provider = createAuthoringInferenceTools({
      runtime: () =>
        ({
          appClient: {
            getWorkspace: async () => ({ spec }),
            applySpec: async (next: typeof spec) => {
              spec = next;
              return { spec };
            },
          },
        }) as never,
      spec: () => spec,
      changed: async () => undefined,
      createApp: async () => undefined,
      selectApp: async () => undefined,
      deleteApp: async () => undefined,
      createSpace: async () => undefined,
    });
    const tools = await provider.resolve({} as never);
    const upsert = tools.find((tool) => tool.id === "builder:upsert_collection")!;
    const definition = upsert.input.properties?.definition;

    expect(definition).toMatchObject({
      type: "object",
      properties: { fields: { type: "array" } },
    });
    await upsert.execute(
      {
        definition: {
          key: "note",
          label: "Note",
          fields: {
            item: { key: "title", label: "Title", type: "text", required: "true" },
          },
        },
        shared: false,
      },
      {} as never,
    );

    expect(spec.collections).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^.{21}$/),
        key: "note",
        fields: [
          expect.objectContaining({
            id: expect.stringMatching(/^.{21}$/),
            key: "title",
            required: true,
          }),
        ],
      }),
    ]);
  });
});
