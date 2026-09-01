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

  const refresh = () => {
    controller.abort();
    controller = new AbortController();
    void registerAll(host, controller.signal);
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
      name: "get_environment",
      title: "Inspect environment",
      description:
        "Inspect the active builder.run environment, workspaces, actors, and persistence backend.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => {
        const snap = host.snapshot();
        return {
          environment: snap.environment.name,
          workspace: snap.workspace.name,
          actor: snap.actor.name,
          backend: snap.backend,
          workspaces: snap.workspaces,
          environments: snap.environments,
        };
      },
    },
    {
      name: "get_spec",
      title: "Inspect application spec",
      description:
        "Return the canonical application spec for the active workspace, including shared types.",
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
      description: "Replace the active workspace spec from a YAML or JSON document.",
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
        "Create or update a type in the application spec. Use store 'directory' for shared types.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          store: { type: "string" },
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
          type: { type: "string" },
          key: { type: "string" },
          label: { type: "string" },
          field_type: { type: "string" },
          required: { type: "boolean" },
          values: { type: "array", items: { type: "string" } },
          target: { type: "string" },
        },
        required: ["type", "key"],
        additionalProperties: false,
      },
      execute: async (input) =>
        host.upsertField(String(input.type), {
          key: String(input.key),
          label: input.label as string | undefined,
          type: (input.field_type as never) || "text",
          required: Boolean(input.required),
          values: input.values as string[] | undefined,
          target: input.target as string | undefined,
        }),
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
      description: "Create or update a page composed of views, forms, actions, and text.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          path: { type: "string" },
          blocks: { type: "array" },
        },
        required: ["key"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertPage(input as never),
    },
    {
      name: "create_workspace",
      title: "Create workspace",
      description: "Create a workspace in the active environment and switch to it.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, sample: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async ({ name, sample }) => {
        if (sample) return host.loadSample(String(sample));
        return host.createWorkspace(String(name));
      },
    },
    {
      name: "switch_workspace",
      title: "Switch workspace",
      description: "Switch the active workspace by id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      execute: async ({ id }) => {
        await host.switchWorkspace(String(id));
        return host.snapshot().workspace;
      },
    },
    {
      name: "create_environment",
      title: "Create environment",
      description: "Create a new environment with its own shared directory and workspaces.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async ({ name }) => host.createEnvironment(String(name)),
    },
    {
      name: "list_samples",
      title: "List sample apps",
      description: "List gallery sample applications that can be loaded into a workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () =>
        sampleApps.map((sample) => ({
          key: sample.key,
          label: sample.label,
          description: sample.description,
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
