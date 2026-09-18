import { describe, expect, it, vi } from "vite-plus/test";
import { MemoryPersistenceAdapter } from "@jthum/framework/persistence";
import { emptySpec, openRuntime, createApp, resolveApp } from "$lib/framework/bootstrap.ts";
import {
  buildTools,
  createWebMcpBridge,
  type ToolContext,
  type WebMcpToolRegistry,
} from "./webmcp.ts";

async function fixture() {
  let runtime = await openRuntime({
    kernel: { persistence: new MemoryPersistenceAdapter() },
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
