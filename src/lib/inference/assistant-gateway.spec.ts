import { describe, expect, it, vi } from "vite-plus/test";
import type { ContextualInferenceTool, InferenceToolContext } from "@jthum/framework/kernel";
import type { JsonValue } from "@jthum/framework/spec";
import { assistantGateway } from "./assistant-gateway.ts";

const context = {
  execution: { workspaceId: "space", actorId: "user" },
  messages: [],
  step: 1,
  activeToolIds: new Set<string>(),
} as unknown as InferenceToolContext;
const definition = (
  name: string,
  availability: "eager" | "discoverable",
): ContextualInferenceTool => ({
  id: `builder:${name}`,
  name,
  label: name,
  description: name,
  input: { type: "object" },
  availability,
  execute: async () => null,
});

describe("Assistant tool presentation", () => {
  it("discovers only MCP tools and delegates execution to the original authorized snapshot", async () => {
    const definitions = [
      definition("get_spec", "eager"),
      definition("create_record", "discoverable"),
    ];
    const execute = vi.fn(async () => ({ id: "note" }));
    const gateway = assistantGateway(
      {
        resolve: async (step) => {
          expect(step.activeToolIds).toEqual(new Set(definitions.map((tool) => tool.id)));
          return {
            tools: [
              ...definitions,
              { ...definitions[0]!, id: "action:records.create", name: "records_create" },
            ],
            execute,
          };
        },
      },
      { resolve: () => definitions },
    );
    const initial = await gateway.resolve(context);
    expect(initial.tools.map((tool) => tool.id)).toEqual(["builder:get_spec", "search_tools"]);
    const found = await initial.execute({
      id: "find",
      toolId: "search_tools",
      input: { query: "create_record" },
    });
    expect(found).toMatchObject({ tools: [{ id: "builder:create_record" }] });
    await expect(
      initial.execute({ id: "unoffered", toolId: "builder:create_record", input: {} }),
    ).rejects.toMatchObject({ code: "RESOURCE.NOT_FOUND" });
    const next = await gateway.resolve({
      ...context,
      activeToolIds: new Set(["builder:create_record"]),
    });
    expect(next.tools.map((tool) => tool.id)).toEqual([
      "builder:get_spec",
      "builder:create_record",
    ]);
    const call = { id: "create", toolId: "builder:create_record", input: {} };
    await expect(next.execute(call)).resolves.toEqual({ id: "note" });
    expect(execute).toHaveBeenCalledExactlyOnceWith(call);
  });

  it("honors Kernel denial and tool removal, and validates discovery arguments", async () => {
    let definitions = [
      definition("get_spec", "eager"),
      definition("create_record", "discoverable"),
    ];
    const execute = vi.fn(async () => {
      throw new Error("Permission revoked.");
    });
    const gateway = assistantGateway(
      { resolve: async () => ({ tools: definitions, execute }) },
      { resolve: () => definitions },
    );
    const initial = await gateway.resolve(context);
    const invalidInputs: Readonly<Record<string, JsonValue>>[] = [
      { query: "" },
      { query: "record", limit: 0 },
      { query: "record", limit: 1.5 },
    ];
    for (const input of invalidInputs)
      await expect(
        initial.execute({ id: "find", toolId: "search_tools", input }),
      ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
    const activated = await gateway.resolve({
      ...context,
      activeToolIds: new Set(["builder:create_record"]),
    });
    await expect(
      activated.execute({ id: "write", toolId: "builder:create_record", input: {} }),
    ).rejects.toThrow("Permission revoked.");
    definitions = [];
    expect((await gateway.resolve(context)).tools).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
