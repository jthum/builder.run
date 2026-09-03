import type { Host } from "./host.ts";
import { sampleApps } from "./samples.ts";

interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

function supported(): boolean {
  return (
    typeof document !== "undefined" && typeof document.modelContext?.registerTool === "function"
  );
}

export function webmcpSupported(): boolean {
  return supported();
}

export function createWebMcpBridge(host: Host): () => void {
  if (!supported()) return () => undefined;
  let controller = new AbortController();
  let queue: Promise<void> = Promise.resolve();

  const refresh = () => {
    queue = queue.then(async () => {
      controller.abort();
      controller = new AbortController();
      await registerAll(host, controller.signal);
    });
  };

  refresh();
  return host.subscribe(refresh);
}

async function registerAll(host: Host, signal: AbortSignal): Promise<void> {
  const tools = buildTools(host);
  for (const tool of tools) {
    if (signal.aborted) return;
    try {
      await document.modelContext?.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: async (input: Record<string, unknown> = {}) => {
            const result = await tool.execute(input ?? {});
            return result ?? { ok: true };
          },
        },
        { signal },
      );
    } catch {
      // Host without a complete WebMCP implementation should not break the app.
    }
  }
}

export function buildTools(host: Host): ToolDefinition[] {
  const spec = host.resolvedSpec();
  const tools: ToolDefinition[] = [
    {
      name: "get_space",
      title: "Inspect space",
      description: "Inspect the active space: its apps, actors, and persistence backend.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => {
        const snap = host.snapshot();
        return {
          space: snap.space.name,
          app: snap.app.name,
          actor: snap.actor.name,
          backend: snap.backend,
          apps: snap.apps,
          spaces: snap.spaces,
        };
      },
    },
    {
      name: "get_spec",
      title: "Inspect application spec",
      description:
        "Return the canonical application spec for the active app, including types the space exposes.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => host.resolvedSpec(),
    },
    {
      name: "export_spec",
      title: "Export spec",
      description: "Export the portable application spec as YAML or JSON.",
      inputSchema: {
        type: "object",
        properties: { format: { type: "string", enum: ["yaml", "json"] } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: ({ format }) => ({
        format: format === "json" ? "json" : "yaml",
        spec: format === "json" ? host.exportJson() : host.exportYaml(),
      }),
    },
    {
      name: "apply_spec",
      title: "Apply spec",
      description: "Replace the active app spec from a YAML or JSON document.",
      inputSchema: {
        type: "object",
        properties: { spec: { type: "string", description: "YAML or JSON spec" } },
        required: ["spec"],
        additionalProperties: false,
      },
      execute: async ({ spec }) => host.replaceSpecText(String(spec ?? "")),
    },
    {
      name: "upsert_type",
      title: "Create or update a type",
      description:
        "Create or update a type in the application spec. Set expose true for types on the account space that apps can use.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          store: { type: "string" },
          expose: { type: "boolean" },
          fields: { type: "object" },
        },
        required: ["key"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertType(input as never),
    },
    {
      name: "upsert_field",
      title: "Add or update a field",
      description:
        "Add or update a field on a type. Types: text, number, date, boolean, enum, reference.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type key" },
          type_key: { type: "string", description: "Alias for type" },
          key: { type: "string" },
          label: { type: "string" },
          field_type: { type: "string" },
          required: { type: "boolean" },
          values: { type: "array", items: { type: "string" } },
          target: { type: "string" },
        },
        required: ["key"],
        additionalProperties: false,
      },
      execute: async (input) =>
        host.upsertField(String(input.type_key ?? input.type), {
          key: String(input.key),
          label: input.label as string | undefined,
          type: (input.field_type as never) || "text",
          required: Boolean(input.required),
          values: input.values as string[] | undefined,
          target: input.target as string | undefined,
        }),
    },
    {
      name: "rename_field",
      title: "Rename a field",
      description: "Rename a field key while keeping its identity and stored values.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["type", "from", "to"],
        additionalProperties: false,
      },
      execute: async (input) =>
        host.renameField(String(input.type), String(input.from), String(input.to)),
    },
    {
      name: "delete_field",
      title: "Delete a field",
      description: "Remove a field from a type and drop its SQLite column.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string" },
          key: { type: "string" },
        },
        required: ["type", "key"],
        additionalProperties: false,
      },
      execute: async (input) => {
        await host.deleteField(String(input.type), String(input.key));
        return { ok: true };
      },
    },
    {
      name: "upsert_view",
      title: "Create or update a view",
      description: "Create or update a named view over a type.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          source: { type: "string" },
          fields: { type: "array", items: { type: "string" } },
          where: { type: "object" },
          expose: { type: "array", items: { type: "string" } },
          limit: { type: "number" },
          order_by: { type: "object" },
        },
        required: ["key", "source"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertView(input as never),
    },
    {
      name: "upsert_form",
      title: "Create or update a form",
      description: "Create or update a form over a type.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string" },
          fields: { type: "array", items: { type: "string" } },
          mode: { type: "string", enum: ["create", "edit", "custom"] },
        },
        required: ["key", "type"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertForm(input as never),
    },
    {
      name: "upsert_flow",
      title: "Create or update a flow",
      description:
        "Create or update a flow. Steps may create, set, delete, query, branch, or invoke other flows.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          input: { type: "object" },
          when: {},
          trigger: { type: "object" },
          expose: { type: "array", items: { type: "string" } },
          steps: { type: "array" },
        },
        required: ["key"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertFlow(input as never),
    },
    {
      name: "upsert_page",
      title: "Create or update a page",
      description:
        "Create or update a page of grids and widgets. Optional folder groups it under Home.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          path: { type: "string" },
          folder: { type: "string" },
          blocks: { type: "array" },
        },
        required: ["key"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertPage(input as never),
    },
    {
      name: "create_app",
      title: "Create app",
      description: "Create an app in the active space and switch to it.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, sample: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async ({ name, sample }) => {
        if (sample) return host.loadSample(String(sample), String(name));
        return host.createApp(String(name));
      },
    },
    {
      name: "delete_app",
      title: "Delete app",
      description: "Delete an app created from this account space. Shared records stay.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      execute: async ({ id }) => host.deleteApp(String(id)),
    },
    {
      name: "switch_app",
      title: "Switch app",
      description: "Switch the active app by id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      execute: async ({ id }) => {
        await host.switchApp(String(id));
        return host.snapshot().app;
      },
    },
    {
      name: "create_space",
      title: "Create space",
      description: "Create a new account space with its own apps and optional exposed types.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async ({ name }) => host.createSpace(String(name)),
    },
    {
      name: "list_samples",
      title: "List sample apps",
      description: "List gallery sample applications that can be loaded as an app.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () =>
        sampleApps.map((sample) => ({
          key: sample.key,
          label: sample.label,
          description: sample.description,
          category: sample.category,
        })),
    },
  ];

  for (const type of spec.types) {
    const key = type.key;
    tools.push(
      {
        name: `list_${key}`,
        title: `List ${type.label}`,
        description: `List ${type.label} records.`,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => host.listRecords(key),
      },
      {
        name: `get_${key}`,
        title: `Get ${type.label}`,
        description: `Get a ${type.label} record by id.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: ({ id }) => host.getRecord(key, String(id)),
      },
      {
        name: `create_${key}`,
        title: `Create ${type.label}`,
        description: `Create a ${type.label} record.`,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            type.fields.map((field) => [
              field.key,
              { type: jsonSchemaType(field.type), description: field.label },
            ]),
          ),
          required: type.fields.filter((field) => field.required).map((field) => field.key),
          additionalProperties: false,
        },
        execute: (input) => host.create(key, input),
      },
      {
        name: `update_${key}`,
        title: `Update ${type.label}`,
        description: `Update a ${type.label} record.`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            ...Object.fromEntries(
              type.fields.map((field) => [field.key, { type: jsonSchemaType(field.type) }]),
            ),
          },
          required: ["id"],
          additionalProperties: false,
        },
        execute: ({ id, ...fields }) => host.update(key, String(id), fields),
      },
      {
        name: `delete_${key}`,
        title: `Delete ${type.label}`,
        description: `Delete a ${type.label} record.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        execute: async ({ id }) => {
          await host.remove(key, String(id));
          return { ok: true };
        },
      },
    );
  }

  for (const flow of spec.flows) {
    if (!flow.expose?.includes("agent")) continue;
    tools.push({
      name: `invoke_${flow.key}`,
      title: flow.label,
      description: `Invoke the ${flow.label} flow.`,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(flow.input ?? {}).map(([name, expr]) => [
            name,
            { type: "string", description: expr },
          ]),
        ),
        additionalProperties: false,
      },
      execute: (input) => host.invoke(flow.key, input),
    });
  }

  return tools;
}

function jsonSchemaType(kind: string): string {
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  return "string";
}
