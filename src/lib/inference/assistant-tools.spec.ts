import { createEmptySpec } from "@jthum/framework/spec";
import { describe, expect, it } from "vite-plus/test";
import type { ToolContext } from "$lib/app/webmcp.ts";
import { createAssistantTools } from "./assistant-tools.ts";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import { LOCAL_BROWSER_ENVIRONMENT } from "@jthum/framework/kernel";
import { emptySpec, openRuntime } from "$lib/framework/bootstrap.ts";

const EXECUTION = { workspaceId: "app", actorId: "user" };
const CALLER = { execution: EXECUTION } as never;

describe("authoring inference tools", () => {
  it("authors current Rule results, tool metadata and conditional User requests through Framework", async () => {
    const runtime = await openRuntime({
      kernel: {
        persistence: new MemoryPersistenceAdapter(),
        environment: { ...LOCAL_BROWSER_ENVIRONMENT, durableRuleExecution: true },
      },
      seed: {
        spaceName: "Space",
        appName: "Test",
        user: { name: "Jane" },
        spaceSpec: emptySpec("space", "Space"),
        appSpec: emptySpec("test", "Test"),
      },
    });
    let spec = runtime.app.spec;
    const unavailable = async () => {
      throw new Error("Not available.");
    };
    const provider = createAssistantTools({
      runtime: () => runtime,
      spec: () => spec,
      changed: async () => {
        spec = (await runtime.appClient.getWorkspace()).spec;
      },
      createApp: unavailable,
      selectApp: unavailable,
      deleteApp: unavailable,
      createSpace: unavailable,
    });
    try {
      const tools = new Map(
        (await provider.resolve({ execution: runtime.appContext } as never)).map((tool) => [
          tool.id,
          tool,
        ]),
      );
      const rule = tools.get("builder:upsert_rule")!;
      expect(rule.input.properties?.definition).toMatchObject({
        properties: {
          result: { type: "json" },
          output: { type: "json" },
          tool: { type: "object" },
        },
      });
      await rule.execute(
        {
          definition: {
            id: "echo-definition",
            key: "echo",
            label: "Echo",
            expose: ["agent"],
            tool: { name: "repeat_message", description: "Return the supplied message." },
            input: { message: { value: "text", required: true } },
            steps: [{ compute: { assign: { reply: { $ref: "vars.message" } } } }],
            result: { $ref: "vars.reply" },
            output: { type: "text" },
          },
        },
        {} as never,
      );
      expect(spec.rules[0]).toMatchObject({
        id: "echo-definition",
        tool: { name: "repeat_message" },
        output: { type: "text" },
      });
      expect(
        await runtime.appClient.runRule("echo", { input: { message: "Hello" } }),
      ).toMatchObject({ status: "completed", result: "Hello" });
      await rule.execute(
        {
          definition: {
            key: "approve",
            label: "Approve",
            steps: [
              {
                wait: {
                  as: "response",
                  request: {
                    label: "Review request",
                    fields: [
                      {
                        id: "approved-field",
                        key: "approved",
                        label: "Approve?",
                        type: "boolean",
                        required: true,
                      },
                      {
                        key: "details",
                        label: "Details",
                        type: "text",
                        behavior: {
                          requiredWhen: { fieldId: "approved-field", operator: "eq", value: true },
                        },
                      },
                    ],
                  },
                },
              },
            ],
            result: { $ref: "vars.response.approved" },
            output: { type: "boolean" },
          },
        },
        {} as never,
      );
      const approval = spec.rules.find((item) => item.key === "approve")!;
      const step = approval.steps[0]!;
      if (!("wait" in step) || !step.wait.request) throw new Error("Missing request.");
      expect(step.wait.request.fields[0]?.id).toBe("approved-field");
      expect(step.wait.request.fields[1]?.id).toBeTruthy();
      const paused = await runtime.appClient.startRule("approve");
      const [request] = await runtime.appClient.listActorRequests(paused.id);
      await runtime.appClient.respondToActorRequest(paused.id, request!.id, {
        approved: true,
        details: "Reviewed",
      });
      expect(await runtime.appClient.getRuleExecutionDetails(paused.id)).toMatchObject({
        status: "completed",
        result: true,
      });
      await tools.get("builder:upsert_collection")!.execute(
        {
          definition: {
            id: "note-definition",
            key: "note",
            label: "Note",
            titleFieldId: "title-field",
            fields: [
              { id: "title-field", key: "title", label: "Title", type: "text" },
              {
                id: "details-field",
                key: "details",
                label: "Details",
                type: "text",
                behavior: {
                  visibleWhen: { fieldId: "title-field", operator: "eq", value: "Special" },
                },
              },
            ],
          },
        },
        {} as never,
      );
      expect(spec.collections[0]).toMatchObject({
        id: "note-definition",
        titleFieldId: "title-field",
        fields: [
          { id: "title-field" },
          { id: "details-field", behavior: { visibleWhen: { fieldId: "title-field" } } },
        ],
      });
    } finally {
      await runtime.kernel.close();
    }
  });
  it("reuses the Builder tool surface with compact contextual discovery", async () => {
    const spec = createEmptySpec({ id: "spec", key: "test", label: "Test" });
    const unavailable = () => {
      throw new Error("not executed");
    };
    const provider = createAssistantTools({
      runtime: () => ({ appContext: EXECUTION }) as never,
      spec: () => spec,
      changed: async () => undefined,
      createApp: unavailable,
      selectApp: unavailable,
      deleteApp: unavailable,
      createSpace: unavailable,
    } satisfies ToolContext);

    const tools = await provider.resolve(CALLER);
    expect(tools.find((tool) => tool.id === "builder:get_spec")?.availability).toBe("eager");
    expect(tools.find((tool) => tool.id === "builder:upsert_collection")?.availability).toBe(
      "discoverable",
    );
    expect(tools.some((tool) => tool.id === "builder:create_app")).toBe(true);
    expect(tools.some((tool) => tool.id === "builder:create_record")).toBe(true);
    expect(tools.find((tool) => tool.id === "builder:create_record")?.name).toBe("create_record");
    expect(tools.every((tool) => tool.id.startsWith("builder:"))).toBe(true);
    expect(
      await provider.resolve({ execution: { ...EXECUTION, actorId: "agent" } } as never),
    ).toEqual([]);
    expect(
      await provider.resolve({ execution: { ...EXECUTION, workspaceId: "another-app" } } as never),
    ).toEqual([]);
  });

  it("describes Collection fields precisely and generates stable IDs for new definitions", async () => {
    let spec = createEmptySpec({ id: "spec", key: "test", label: "Test" });
    const provider = createAssistantTools({
      runtime: () =>
        ({
          appContext: EXECUTION,
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
    const tools = await provider.resolve(CALLER);
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
        id: expect.stringMatching(/^.{16}$/),
        key: "note",
        fields: [
          expect.objectContaining({
            id: expect.stringMatching(/^.{16}$/),
            key: "title",
            required: true,
          }),
        ],
      }),
    ]);
  });

  it("generates definition and nested IDs across the complete authoring surface", async () => {
    let spec = createEmptySpec({ id: "spec", key: "test", label: "Test" });
    const provider = createAssistantTools({
      runtime: () =>
        ({
          appContext: EXECUTION,
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
    const tools = new Map((await provider.resolve(CALLER)).map((tool) => [tool.id, tool]));

    await tools.get("builder:upsert_collection")!.execute(
      {
        definition: {
          key: "note",
          label: "Note",
          fields: [{ key: "title", label: "Title", type: "text" }],
        },
      },
      {} as never,
    );
    const collection = spec.collections[0]!;
    await tools
      .get("builder:upsert_view")!
      .execute({ definition: { key: "notes", label: "Notes", source: "note" } }, {} as never);
    await tools.get("builder:upsert_form")!.execute(
      {
        definition: {
          key: "new_note",
          label: "New note",
          mode: "create",
          collectionId: collection.id,
          fieldIds: [collection.fields[0]!.id],
        },
      },
      {} as never,
    );
    await tools.get("builder:upsert_page")!.execute(
      {
        definition: {
          key: "overview",
          label: "Overview",
          layout: [{ kind: "block", block: "heading", config: { text: "Overview" } }],
        },
      },
      {} as never,
    );
    await tools.get("builder:upsert_rule")!.execute(
      {
        definition: {
          key: "note_created",
          label: "Note created",
          steps: [{ delay: { duration: 1 } }],
        },
      },
      {} as never,
    );

    expect(spec.views[0]?.id).toMatch(/^.{16}$/);
    expect(spec.forms[0]?.id).toMatch(/^.{16}$/);
    expect(spec.pages[0]?.id).toMatch(/^.{16}$/);
    expect(spec.pages[0]?.layout[0]?.id).toMatch(/^.{16}$/);
    expect(spec.rules[0]?.id).toMatch(/^.{16}$/);
    expect(spec.rules[0]?.steps[0]?.id).toMatch(/^.{16}$/);
  });
});
