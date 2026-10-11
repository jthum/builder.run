import { describe, expect, it, vi } from "vite-plus/test";
import { createWorkspaceClient } from "@jthum/framework/client";
import {
  createAesGcmSecretCipher,
  LOCAL_BROWSER_ENVIRONMENT,
  type InferenceEvent,
  type InferenceMessage,
} from "@jthum/framework/kernel";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import {
  emptySpec,
  openRuntime,
  createApp,
  resolveApp,
  deleteApp,
  createSpace,
  type OpenedRuntime,
} from "$lib/framework/bootstrap.ts";
import type { ToolContext } from "$lib/app/webmcp.ts";
import { createAssistantTools } from "./assistant-tools.ts";
import { createBrowserInferenceRuntime } from "./runtime.ts";

const PERSONAL_SETTINGS = {
  baseUrl: "https://personal.test/v1",
  model: "personal-model",
  apiKey: "personal-key",
};

interface ProviderRequest {
  model: string;
  temperature?: number;
  messages: Array<{ role: string; content?: string }>;
  tools?: Array<{ function: { name: string } }>;
}

function body(init?: RequestInit): ProviderRequest {
  if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
  return JSON.parse(init.body) as ProviderRequest;
}

function stream(delta: Record<string, unknown>, reason = "stop"): Response {
  const chunks = [
    { choices: [{ index: 0, delta, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: reason }] },
  ];
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
    {
      headers: { "content-type": "text/event-stream" },
    },
  );
}

function toolCall(name: string, input: unknown, id: string): Response {
  return stream(
    {
      tool_calls: [
        { index: 0, id, type: "function", function: { name, arguments: JSON.stringify(input) } },
      ],
    },
    "tool_calls",
  );
}

async function collect(events: AsyncIterable<InferenceEvent>): Promise<InferenceEvent[]> {
  const result: InferenceEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

async function fixture(
  fetch: typeof globalThis.fetch,
  loadSettings = vi.fn(async () => PERSONAL_SETTINGS),
) {
  let runtime: OpenedRuntime;
  let spec = emptySpec("test", "Test");
  const context: ToolContext = {
    runtime: () => runtime,
    spec: () => spec,
    changed: async () => {
      spec = (await runtime.appClient.getWorkspace()).spec;
    },
    createApp: async (name) => {
      runtime = {
        ...runtime,
        ...(await createApp(runtime.kernel, runtime.spaceContext, {
          name,
          spec: emptySpec("new", name),
        })),
      };
    },
    selectApp: async (id) => {
      runtime = {
        ...runtime,
        ...(await resolveApp(
          runtime.kernel,
          { spaceId: runtime.space.id, appId: id },
          runtime.actorId,
        )),
      };
    },
    deleteApp: async (id) => {
      runtime = { ...runtime, ...(await deleteApp(runtime.kernel, runtime.spaceContext, id)) };
    },
    createSpace: async (name) => {
      runtime = {
        ...runtime,
        ...(await createSpace(runtime.kernel, {
          spaceName: name,
          appName: "Home",
          user: { name: "Jane" },
          spaceSpec: emptySpec("space", name),
          appSpec: emptySpec("home", "Home"),
        })),
      };
    },
  };
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const assistantTools = createAssistantTools(context);
  runtime = await openRuntime({
    kernel: {
      persistence: new MemoryPersistenceAdapter(),
      environment: { ...LOCAL_BROWSER_ENVIRONMENT, inference: true },
      secretCipher: createAesGcmSecretCipher(async () => key),
      inference: createBrowserInferenceRuntime({ fetch, loadSettings, assistantTools }),
      inferenceTools: [assistantTools],
    },
    seed: {
      spaceName: "Space",
      appName: "Test",
      user: { name: "Jane" },
      spaceSpec: emptySpec("space", "Space"),
      appSpec: spec,
    },
  });
  return { ...runtime, loadSettings, current: () => runtime };
}

const PROMPT: readonly InferenceMessage[] = [
  { role: "user", content: "Create a Note collection." },
];
const PERSONAL_MODEL = { provider: "openai-compatible", model: PERSONAL_SETTINGS.model };

describe("Framework browser inference integration", () => {
  it("uses the complete MCP catalog to create an App and then author, write and query in that App", async () => {
    const operations: Array<[string, Record<string, unknown>]> = [
      ["create_app", { name: "Notes" }],
      [
        "upsert_collection",
        {
          definition: {
            key: "note",
            label: "Note",
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
        },
      ],
      ["create_record", { collection: "note", values: { title: "First note" } }],
      ["upsert_view", { definition: { key: "notes", label: "Notes", source: "note" } }],
      ["query_view", { key: "notes" }],
      [
        "upsert_rule",
        {
          definition: {
            key: "echo",
            label: "Echo",
            expose: ["agent"],
            steps: [{ compute: { assign: { reply: "Hello" } } }],
            result: { $ref: "vars.reply" },
            output: { type: "text" },
          },
        },
      ],
      ["invoke_echo", {}],
    ];
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const request = body(init);
      // No root-scoped records_create or duplicate Framework action tools are offered.
      expect(request.tools?.some((tool) => tool.function.name === "records_create")).toBe(false);
      const operation = operations[Math.floor(calls / 2)];
      if (!operation)
        return stream({ content: "Created Notes, saved a note, queried it and ran Echo." });
      const [name, input] = operation;
      if (calls++ % 2 === 0) return toolCall("search_tools", { query: name }, `find-${name}`);
      expect(request.tools?.some((tool) => tool.function.name === name)).toBe(true);
      return toolCall(name, input, `run-${name}`);
    });
    const runtime = await fixture(fetch);
    try {
      const events = await collect(
        await runtime.spaceClient.runInference({
          messages: PROMPT,
          model: PERSONAL_MODEL,
          metadata: { surface: "assistant" },
        }),
      );
      expect(
        events.filter((event) => event.type === "failed" || event.type === "tool_error"),
      ).toEqual([]);
      expect(events.at(-1)).toMatchObject({ type: "completed" });
      expect(runtime.current().app.id).not.toBe(runtime.app.id);
      expect(runtime.current().app.name).toBe("Notes");
      expect((await runtime.appClient.getWorkspace()).spec.collections).toHaveLength(0);
      expect((await runtime.spaceClient.getWorkspace()).spec.collections).toHaveLength(0);
      expect(await runtime.current().appClient.listRecords("note")).toMatchObject([
        { values: { title: "First note" } },
      ]);
      const query = events.find(
        (event) => event.type === "tool_result" && event.toolId === "builder:query_view",
      );
      expect(JSON.stringify(query)).toContain("First note");
      const rule = events.find(
        (event) => event.type === "tool_result" && event.toolId === "builder:invoke_echo",
      );
      expect(rule).toMatchObject({ output: { status: "completed", result: "Hello" } });
    } finally {
      await runtime.kernel.close();
    }
  });

  it("continues after deleting the selected App without targeting its deleted Workspace", async () => {
    let appId = "";
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const request = body(init);
      calls++;
      if (calls === 1) return toolCall("search_tools", { query: "delete_app" }, "find");
      if (calls === 2) return toolCall("delete_app", { id: appId }, "delete");
      expect(request.tools?.some((tool) => tool.function.name === "get_spec")).toBe(true);
      if (calls === 3) return toolCall("get_spec", {}, "inspect");
      return stream({ content: "Deleted the App and selected the remaining App." });
    });
    const runtime = await fixture(fetch);
    try {
      await createApp(runtime.kernel, runtime.spaceContext, {
        name: "Keep",
        spec: emptySpec("keep", "Keep"),
      });
      appId = runtime.app.id;
      const events = await collect(
        await runtime.spaceClient.runInference({
          messages: PROMPT,
          model: PERSONAL_MODEL,
          metadata: { surface: "assistant" },
        }),
      );
      expect(events.at(-1)).toMatchObject({ type: "completed" });
      expect(events.some((event) => event.type === "failed" || event.type === "tool_error")).toBe(
        false,
      );
      expect(runtime.current().app.name).toBe("Keep");
    } finally {
      await runtime.kernel.close();
    }
  });

  it("does not lend the old User's tools to the independently issued User after Space creation", async () => {
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const request = body(init);
      calls++;
      if (calls === 1) return toolCall("search_tools", { query: "create_space" }, "find");
      if (calls === 2) return toolCall("create_space", { name: "Independent" }, "create");
      expect(request.tools ?? []).toHaveLength(0);
      return stream({ content: "Created the new Space." });
    });
    const runtime = await fixture(fetch);
    try {
      const events = await collect(
        await runtime.spaceClient.runInference({
          messages: PROMPT,
          model: PERSONAL_MODEL,
          metadata: { surface: "assistant" },
        }),
      );
      expect(events.at(-1)).toMatchObject({ type: "completed" });
      expect(runtime.current().actorId).not.toBe(runtime.actorId);
      expect(runtime.current().space.name).toBe("Independent");
    } finally {
      await runtime.kernel.close();
    }
  });

  it("streams, discovers authoring tools, writes canonical Specs and replays a follow-up turn", async () => {
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe("https://personal.test/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer personal-key");
      const request = body(init);
      expect(request.model).toBe(PERSONAL_SETTINGS.model);
      calls++;
      if (calls === 1) {
        expect(
          request.tools?.some((tool) => tool.function.name.includes("upsert_collection")),
        ).toBe(false);
        return toolCall("search_tools", { query: "upsert_collection" }, "discover");
      }
      if (calls === 2) {
        const name = request.tools?.find((tool) => tool.function.name.includes("upsert_collection"))
          ?.function.name;
        expect(name).toBeDefined();
        return toolCall(
          name!,
          {
            definition: {
              key: "note",
              label: "Note",
              fields: [{ key: "title", label: "Title", type: "text", required: true }],
            },
          },
          "create",
        );
      }
      if (calls === 3)
        return stream({
          reasoning_content: "Check the successful tool result.",
          content: "Created Note.",
        });
      expect(request.messages.filter((message) => message.role === "tool")).toHaveLength(2);
      expect(request.messages.at(-1)?.content).toBe("Thanks.");
      return stream({ content: "You're welcome." });
    });
    const runtime = await fixture(fetch);
    try {
      const events = await collect(
        await runtime.appClient.runInference({ messages: PROMPT, model: PERSONAL_MODEL }),
      );
      expect(events.some((event) => event.type === "reasoning_delta")).toBe(true);
      expect(events.some((event) => event.type === "text_delta")).toBe(true);
      expect(events.some((event) => event.type === "tool_error" || event.type === "failed")).toBe(
        false,
      );
      const completed = events.at(-1);
      expect(completed).toMatchObject({ type: "completed", output: "Created Note." });
      const spec = (await runtime.appClient.getWorkspace()).spec;
      expect(spec.collections[0]).toMatchObject({
        key: "note",
        fields: [{ key: "title", type: "text", required: true }],
      });
      expect(spec.collections[0]?.id).toBeTruthy();
      expect(spec).not.toHaveProperty("apiKey");
      if (completed?.type !== "completed" || !completed.messages)
        throw new Error("Missing replay history.");
      const next = await collect(
        await runtime.appClient.runInference({
          model: PERSONAL_MODEL,
          messages: [...completed.messages, { role: "user", content: "Thanks." }],
        }),
      );
      expect(next.at(-1)).toMatchObject({ type: "completed", output: "You're welcome." });
      expect(fetch).toHaveBeenCalledTimes(4);
    } finally {
      await runtime.kernel.close();
    }
  });

  it("uses persisted ModelConfig, endpoint and selected encrypted credential instead of overrides or profile settings", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe("https://workspace.test/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer workspace-key");
      expect(body(init)).toMatchObject({ model: "workspace-model", temperature: 0.2 });
      return stream({ content: "Ready." });
    });
    const runtime = await fixture(fetch);
    try {
      await runtime.appClient.putSetting({
        key: "inference.openai.base_url",
        label: "Endpoint",
        value: "https://workspace.test/v1",
      });
      await runtime.appClient.putSetting({
        key: "api_key",
        label: "API key",
        secret: true,
        value: "workspace-key",
      });
      const model = await runtime.appClient.createModelConfig({
        name: "Workspace model",
        provider: "openai-compatible",
        model: "workspace-model",
        credentialRef: "api_key",
        settings: { temperature: 0.2 },
      });
      const events = await collect(
        await runtime.appClient.runInference({
          messages: PROMPT,
          model: {
            configId: model.id,
            provider: "ignored",
            model: "ignored",
            credentialRef: "ignored",
          },
        }),
      );
      expect(events.at(-1)).toMatchObject({ type: "completed", output: "Ready." });
      expect(runtime.loadSettings).not.toHaveBeenCalled();
      expect(JSON.stringify(events)).not.toContain("workspace-key");
    } finally {
      await runtime.kernel.close();
    }
  });

  it("keeps Agent model and credentials in its issuing Workspace when acting in an App", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe("https://origin.test/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer origin-key");
      expect(body(init).model).toBe("agent-model");
      expect(body(init).messages[0]?.content).toContain("Review requests.");
      expect(body(init).tools?.some((tool) => tool.function.name.includes("upsert_"))).toBe(false);
      return stream({ content: "Reviewed." });
    });
    const runtime = await fixture(fetch);
    try {
      await runtime.spaceClient.putSetting({
        key: "inference.openai.base_url",
        label: "Endpoint",
        value: "https://origin.test/v1",
      });
      await runtime.spaceClient.putSetting({
        key: "api_key",
        label: "API key",
        secret: true,
        value: "origin-key",
      });
      await runtime.appClient.putSetting({
        key: "api_key",
        label: "API key",
        secret: true,
        value: "target-key",
      });
      const model = await runtime.spaceClient.createModelConfig({
        name: "Agent model",
        provider: "openai-compatible",
        model: "agent-model",
        credentialRef: "api_key",
      });
      const agent = await runtime.spaceClient.createAgent({
        name: "Reviewer",
        instructions: "Review requests.",
        modelConfigId: model.id,
      });
      await runtime.appClient.addMembership({
        actorId: agent.actor.id,
        workspaceId: runtime.app.id,
        permissions: ["read"],
      });
      const client = await createWorkspaceClient(runtime.kernel, {
        workspaceId: runtime.app.id,
        actorId: agent.actor.id,
      });
      const events = await collect(
        await client.runInference({ messages: PROMPT, model: PERSONAL_MODEL }),
      );
      expect(events.at(-1)).toMatchObject({ type: "completed", output: "Reviewed." });
      expect(runtime.loadSettings).not.toHaveBeenCalled();
    } finally {
      await runtime.kernel.close();
    }
  });

  it("does not fall back to personal credentials when a configured credential is missing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const runtime = await fixture(fetch);
    try {
      const model = await runtime.appClient.createModelConfig({
        name: "Missing key",
        provider: "openai-compatible",
        model: "model",
        credentialRef: "missing",
      });
      const events = await collect(
        await runtime.appClient.runInference({
          messages: PROMPT,
          model: { ...PERSONAL_MODEL, configId: model.id },
        }),
      );
      expect(events.map((event) => event.type)).toEqual(["started", "failed"]);
      expect(events.at(-1)).toMatchObject({ error: { code: "VALIDATION.INVALID_INPUT" } });
      expect(fetch).not.toHaveBeenCalled();
      expect(runtime.loadSettings).not.toHaveBeenCalled();
    } finally {
      await runtime.kernel.close();
    }
  });

  it("does not route an unsupported provider to the OpenAI-compatible endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const runtime = await fixture(fetch);
    try {
      const events = await collect(
        await runtime.appClient.runInference({
          messages: PROMPT,
          model: { provider: "not-installed", model: "model" },
        }),
      );
      expect(events.at(-1)).toMatchObject({
        type: "failed",
        error: { code: "RESOURCE.NOT_FOUND" },
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await runtime.kernel.close();
    }
  });

  it("returns a normalized terminal event when personal settings cannot load", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const runtime = await fixture(
      fetch,
      vi.fn(async () => {
        throw new Error("private storage details");
      }),
    );
    try {
      const events = await collect(
        await runtime.appClient.runInference({ messages: PROMPT, model: PERSONAL_MODEL }),
      );
      expect(events.map((event) => event.type)).toEqual(["started", "failed"]);
      expect(events.at(-1)).toMatchObject({ error: { code: "INTERNAL.UNEXPECTED" } });
      expect(JSON.stringify(events)).not.toContain("private storage details");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await runtime.kernel.close();
    }
  });
});
