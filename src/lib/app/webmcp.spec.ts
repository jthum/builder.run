import { describe, expect, it, vi } from "vite-plus/test";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import { LOCAL_BROWSER_ENVIRONMENT } from "@jthum/framework/kernel";
import { emptySpec, openRuntime, createApp, resolveApp } from "$lib/framework/bootstrap.ts";
import {
  buildTools,
  createWebMcpBridge,
  type ToolContext,
  type WebMcpToolRegistry,
} from "./webmcp.ts";

async function fixture() {
  let runtime = await openRuntime({
    kernel: {
      persistence: new MemoryPersistenceAdapter(),
      environment: { ...LOCAL_BROWSER_ENVIRONMENT, durableRuleExecution: true },
    },
    seed: {
      spaceName: "Space",
      appName: "Tickets",
      user: { name: "Jane" },
      spaceSpec: emptySpec("space", "Space"),
      appSpec: {
        ...emptySpec("tickets", "Tickets"),
        collections: [
          {
            id: "ticket",
            key: "ticket",
            label: "Ticket",
            fields: [
              { id: "title", key: "title", label: "Title", type: "text", required: true },
              {
                id: "status",
                key: "status",
                label: "Status",
                type: "choice",
                options: [
                  { id: "new", key: "new", label: "New" },
                  { id: "resolved", key: "resolved", label: "Resolved" },
                ],
              },
            ],
            lifecycle: {
              fieldId: "status",
              initial: "new",
              transitions: [
                { id: "resolve", key: "resolve", label: "Resolve", from: ["new"], to: "resolved" },
              ],
            },
          },
        ],
        rules: [
          {
            id: "wait",
            key: "wait",
            label: "Wait",
            expose: ["agent"],
            steps: [{ id: "delay", delay: { duration: "1h" } }],
          },
          {
            id: "remember",
            key: "remember",
            label: "Remember",
            expose: ["agent"],
            enabled: true,
            input: { message: { value: "text", required: true } },
            steps: [{ id: "set", compute: { assign: { copied: { $ref: "vars.message" } } } }],
          },
        ],
      },
    },
  });
  let spec = runtime.app.spec;
  const context: ToolContext = {
    runtime: () => runtime,
    spec: () => spec,
    changed: async () => {
      spec = (await runtime.appClient.getWorkspace()).spec;
    },
    createApp: async (name) => {
      const app = await createApp(runtime.kernel, runtime.spaceContext, {
        name,
        spec: emptySpec("other", name),
      });
      runtime = { ...runtime, ...app };
      spec = app.app.spec;
    },
    selectApp: async (id) => {
      const app = await resolveApp(
        runtime.kernel,
        { spaceId: runtime.space.id, appId: id },
        runtime.actorId,
      );
      runtime = { ...runtime, ...app };
      spec = app.app.spec;
    },
    deleteApp: vi.fn(),
    createSpace: vi.fn(),
  };
  return { context, close: () => runtime.kernel.close() };
}

describe("canonical WebMCP", () => {
  it("advertises the enabled durable runtime rather than short-runner limitations", async () => {
    const { close, context } = await fixture();
    try {
      const tool = buildTools(context).find((item) => item.name === "get_automation_primitives")!;
      const result = await tool.execute({});
      expect(result).toMatchObject({
        profile: {
          capabilities: { durable_waits: "supported", actor_requests: "supported" },
          events: expect.arrayContaining(["form.submitted", "record.created"]),
        },
      });
    } finally {
      await close();
    }
  });
  it("keeps a lifecycle change bound to its original App while awaiting its schema", async () => {
    const value = await fixture();
    const original = value.context.runtime().appClient;
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const getSource = original.getSource.bind(original);
    vi.spyOn(original, "getSource").mockImplementation(async (key) => {
      entered();
      await blocked;
      return getSource(key);
    });
    try {
      const record = await original.createRecord("ticket", { title: "Printer" });
      const tool = buildTools(value.context).find((item) => item.name === "transition_record")!;
      const operation = tool.execute({
        collection: "ticket",
        id: record.id,
        transition: "resolve",
      });
      await ready;
      await value.context.createApp("Other");
      release();
      await operation;
      expect(await original.getRecord("ticket", record.id)).toMatchObject({
        values: { status: "resolved" },
      });
      expect(value.context.spec().key).toBe("other");
    } finally {
      release();
      await value.close();
    }
  });
  it("launches durable workflows and returns a run reference", async () => {
    const value = await fixture();
    try {
      const tool = buildTools(value.context).find((item) => item.name === "invoke_wait")!;
      const result = (await tool.execute({})) as { id: string; mode: string; runUrl: string };
      expect(result).toMatchObject({ mode: "durable", status: "waiting" });
      expect(result.runUrl).toContain(encodeURIComponent(result.id));
      expect(
        await value.context.runtime().appClient.getRuleExecutionDetails(result.id),
      ).toMatchObject({ status: "waiting" });
    } finally {
      await value.close();
    }
  });

  it("returns Framework codes and validation issues without exposing unexpected internals", async () => {
    const value = await fixture();
    const callbacks = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
    const bridge = createWebMcpBridge(
      {
        getTools: (mode) => [
          ...buildTools(value.context, { appTools: mode }),
          {
            name: "unexpected",
            description: "Failure fixture",
            inputSchema: {},
            execute: () => {
              throw new Error("private database path");
            },
          },
        ],
        subscribe: () => () => {},
      },
      {
        registerTool: (tool) => {
          callbacks.set(tool.name, tool.execute);
        },
      },
      { appTools: "compact" },
    );
    try {
      await bridge.flush();
      const invalid = JSON.parse(
        String(await callbacks.get("create_record")!({ collection: "ticket", values: {} })),
      );
      expect(invalid.error).toMatchObject({
        code: "VALIDATION.INVALID_INPUT",
        issues: [expect.objectContaining({ path: "values.title" })],
      });
      const missing = JSON.parse(
        String(await callbacks.get("create_record")!({ collection: "missing", values: {} })),
      );
      expect(missing.error).toMatchObject({
        code: "RESOURCE.NOT_FOUND",
        details: expect.any(Object),
      });
      const unexpected = String(await callbacks.get("unexpected")!({}));
      expect(JSON.parse(unexpected).error.code).toBe("INTERNAL.UNEXPECTED");
      expect(unexpected).not.toContain("private database path");
    } finally {
      bridge.stop();
      await value.close();
    }
  });

  it("keeps an in-flight Spec replacement bound to its original App after switching", async () => {
    const value = await fixture();
    const original = value.context.runtime().appClient;
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const apply = original.applySpec.bind(original);
    vi.spyOn(original, "applySpec").mockImplementation(async (spec) => {
      entered();
      await blocked;
      return apply(spec);
    });
    try {
      const replacement = {
        ...(await original.getWorkspace()).spec,
        id: "replacement",
        label: "Replaced",
      };
      const tool = buildTools(value.context).find((item) => item.name === "apply_spec")!;
      const operation = tool.execute({ spec: replacement });
      await ready;
      await value.context.createApp("Other");
      release();
      await operation;
      expect((await original.getWorkspace()).spec.id).toBe("replacement");
      expect(value.context.spec().key).toBe("other");
      expect((await value.context.runtime().appClient.getWorkspace()).spec.label).toBe("Other");
    } finally {
      release();
      await value.close();
    }
  });
  it("defers registry changes until an executing tool has returned", async () => {
    let changed: (() => void) | undefined;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let description = "Before";
    let execute!: (input: Record<string, unknown>) => Promise<unknown>;
    let registrations = 0;
    let signal: AbortSignal | undefined;
    const bridge = createWebMcpBridge(
      {
        getTools: () => [{ name: "blocked", description, inputSchema: {}, execute: () => blocked }],
        subscribe: (listener) => {
          changed = listener;
          return () => {
            changed = undefined;
          };
        },
      },
      {
        registerTool: (tool, options) => {
          registrations += 1;
          execute = tool.execute;
          signal = options?.signal;
        },
      },
      { appTools: "compact" },
    );
    try {
      await bridge.flush();
      const running = execute({});
      description = "After";
      changed!();
      await Promise.resolve();
      expect(registrations).toBe(1);
      expect(signal?.aborted).toBe(false);
      release();
      await running;
      await bridge.flush();
      expect(registrations).toBe(2);
    } finally {
      release();
      bridge.stop();
    }
    expect(signal?.aborted).toBe(true);
    expect(changed).toBeUndefined();
  });
  it("executes compact CRUD and lifecycle changes through canonical clients", async () => {
    const fixtureValue = await fixture();
    try {
      const tools = new Map(buildTools(fixtureValue.context).map((tool) => [tool.name, tool]));
      expect(tools.has("create_ticket")).toBe(false);
      const record = (await tools
        .get("create_record")!
        .execute({ collection: "ticket", values: { title: "Printer" } })) as { id: string };
      await tools
        .get("transition_record")!
        .execute({ collection: "ticket", id: record.id, transition: "resolve" });
      expect(
        await fixtureValue.context.runtime().appClient.getRecord("ticket", record.id),
      ).toMatchObject({ values: { status: "resolved" } });
      await tools.get("delete_record")!.execute({ collection: "ticket", id: record.id });
      expect(await fixtureValue.context.runtime().appClient.listRecords("ticket")).toEqual([]);
    } finally {
      await fixtureValue.close();
    }
  });

  it("offers typed aliases and passes declared workflow inputs correctly", async () => {
    const value = await fixture();
    try {
      const tools = new Map(
        buildTools(value.context, { appTools: "typed" }).map((tool) => [tool.name, tool]),
      );
      expect(tools.get("create_ticket")!.inputSchema.required).toEqual(["title"]);
      expect(tools.get("create_ticket")!.inputSchema.properties).not.toHaveProperty("status");
      const record = (await tools.get("create_ticket")!.execute({ title: "Printer" })) as {
        id: string;
      };
      expect(record).toHaveProperty("id");
      const result = await tools.get("invoke_remember")!.execute({ message: "Hello" });
      expect(result).toMatchObject({ vars: { copied: "Hello" } });
    } finally {
      await value.close();
    }
  });

  it("retains complete canonical metadata through authoring and export", async () => {
    const value = await fixture();
    try {
      const tools = new Map(buildTools(value.context).map((tool) => [tool.name, tool]));
      await tools.get("upsert_collection")!.execute({
        definition: {
          id: "note",
          key: "note",
          label: "Note",
          meta: { custom: { color: "violet" } },
          fields: [
            {
              id: "body",
              key: "body",
              label: "Body",
              type: "text",
              validation: { maxLength: 200 },
            },
          ],
        },
      });
      const exported = (await tools.get("export_spec")!.execute({ format: "json" })) as {
        spec: string;
      };
      expect(JSON.parse(exported.spec).collections).toContainEqual(
        expect.objectContaining({ meta: { custom: { color: "violet" } } }),
      );
      expect(JSON.parse(exported.spec)).not.toHaveProperty("records");
    } finally {
      await value.close();
    }
  });

  it("installs shared Collections as usable attached Sources", async () => {
    const value = await fixture();
    try {
      const tools = new Map(buildTools(value.context).map((tool) => [tool.name, tool]));
      await tools.get("upsert_collection")!.execute({
        shared: true,
        definition: {
          id: "contact",
          key: "contact",
          label: "Contact",
          fields: [
            { id: "contact_name", key: "name", label: "Name", type: "text", required: true },
          ],
        },
      });
      expect((await value.context.runtime().appClient.getSource("contact"))?.schema.key).toBe(
        "contact",
      );
      expect(
        await value.context.runtime().kernel.listAttachmentsTo(value.context.runtime().appContext),
      ).toEqual([
        expect.objectContaining({
          sourceId: "contact",
          collectionId: "contact",
        }),
      ]);
      await tools.get("create_record")!.execute({ collection: "contact", values: { name: "Ada" } });
      expect(
        (
          (await tools.get("list_records")!.execute({ collection: "contact" })) as {
            rows: unknown[];
          }
        ).rows,
      ).toHaveLength(1);
    } finally {
      await value.close();
    }
  });

  it("keeps registered callbacks bound to the current App even without schema changes", async () => {
    const value = await fixture();
    const registered = new Map<
      string,
      { execute(input: Record<string, unknown>): Promise<unknown> }
    >();
    const listeners = new Set<() => void>();
    const registry: WebMcpToolRegistry = {
      registerTool(tool) {
        registered.set(tool.name, tool);
      },
    };
    const bridge = createWebMcpBridge(
      {
        getTools: (mode) => buildTools(value.context, { appTools: mode }),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      registry,
      { appTools: "compact" },
    );
    try {
      await bridge.flush();
      const original = value.context.runtime().app.id;
      await registered.get("create_app")!.execute({ name: "Notes" });
      const result = JSON.parse(String(await registered.get("get_spec")!.execute({})));
      expect(result.key).toBe("other");
      expect(value.context.runtime().app.id).not.toBe(original);
    } finally {
      bridge.stop();
      expect(listeners.size).toBe(0);
      await value.close();
    }
  });
});
