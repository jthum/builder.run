import type { Host } from "./host.ts";
import { cloneData, FIELD_KINDS, type FieldDef } from "./model.ts";
import { sampleApps } from "./samples.ts";
import { specFromText } from "./serialize.ts";

export type ToolSurface = "builder" | "app";

export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  surface?: ToolSurface;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

export function toolSurface(tool: Pick<ToolDefinition, "surface">): ToolSurface {
  return tool.surface ?? "builder";
}

export interface WebMcpToolRegistry {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean };
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ): Promise<void> | void;
}

export interface WebMcpBridge {
  stop(): void;
  flush(): Promise<void>;
}

function supported(registry?: WebMcpToolRegistry | null): boolean {
  if (registry) return typeof registry.registerTool === "function";
  return (
    typeof document !== "undefined" && typeof document.modelContext?.registerTool === "function"
  );
}

export function webmcpSupported(): boolean {
  return supported();
}

export function toolFingerprint(tools: ToolDefinition[]): string {
  return JSON.stringify(
    tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  );
}

function toolOutput(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(cloneData(value ?? { ok: true }));
}

export function createWebMcpBridge(host: Host, registry?: WebMcpToolRegistry | null): WebMcpBridge {
  const api = registry ?? (typeof document !== "undefined" ? document.modelContext : null);
  if (!api?.registerTool) {
    return { stop() {}, async flush() {} };
  }

  type Slot = { fingerprint: string; controller: AbortController };
  const slots = new Map<string, Slot>();
  const executing = new Set<string>();
  let inflight = 0;
  let dirty = false;
  let pumping = false;
  let stopped = false;
  let backoffMs = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerResolve: (() => void) | null = null;
  let timerPromise = Promise.resolve();
  let chain = Promise.resolve();

  const oneFingerprint = (tool: ToolDefinition) => toolFingerprint([tool]);

  const inSync = (tools: ToolDefinition[]) =>
    tools.length === slots.size &&
    tools.every((tool) => slots.get(tool.name)?.fingerprint === oneFingerprint(tool));

  // Chrome's WebMCP registry is locked for the duration of an execute callback.
  // registerTool/abort during that window deadlocks the page. Never touch the
  // registry until inflight is 0, and then only from a macrotask so Chrome can
  // finish delivering the tool result first. Failed registerTool must back off
  // — an immediate microtask retry livelocks the main thread.
  const armTimer = () => {
    if (stopped || timer || pumping || inflight > 0) return;
    timerPromise = new Promise<void>((resolve) => {
      timerResolve = resolve;
      timer = setTimeout(() => {
        timer = null;
        timerResolve = null;
        const run = chain.then(pump, pump);
        chain = run;
        run.then(resolve, resolve);
      }, backoffMs);
    });
  };

  const schedule = () => {
    dirty = true;
    armTimer();
  };

  const wrapExecute =
    (tool: ToolDefinition) =>
    async (input: Record<string, unknown> = {}) => {
      executing.add(tool.name);
      inflight += 1;
      try {
        try {
          return toolOutput(await tool.execute(input ?? {}));
        } catch (error) {
          return toolOutput({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        executing.delete(tool.name);
        inflight = Math.max(0, inflight - 1);
        if (inflight === 0 && dirty) armTimer();
      }
    };

  const applyDiff = async () => {
    if (stopped || inflight > 0) {
      dirty = true;
      return;
    }
    const tools = buildTools(host);
    const wanted = new Set(tools.map((tool) => tool.name));

    for (const tool of tools) {
      if (stopped || inflight > 0) {
        dirty = true;
        return;
      }
      const fingerprint = oneFingerprint(tool);
      const current = slots.get(tool.name);
      if (current?.fingerprint === fingerprint) continue;
      if (executing.has(tool.name)) {
        dirty = true;
        continue;
      }
      const controller = current?.controller ?? new AbortController();
      try {
        await api.registerTool(
          {
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            execute: wrapExecute(tool),
          },
          { signal: controller.signal },
        );
        slots.set(tool.name, { fingerprint, controller });
        backoffMs = 0;
      } catch {
        dirty = true;
        backoffMs = Math.min(2000, backoffMs ? backoffMs * 2 : 50);
        return;
      }
    }

    if (inflight > 0) {
      dirty = true;
      return;
    }

    for (const [name, slot] of slots) {
      if (wanted.has(name) || executing.has(name)) continue;
      slot.controller.abort();
      slots.delete(name);
    }
  };

  const pump = async () => {
    if (stopped || pumping) return;
    if (inflight > 0) {
      dirty = true;
      return;
    }
    if (!dirty) return;
    pumping = true;
    dirty = false;
    try {
      await applyDiff();
    } finally {
      pumping = false;
      if (dirty && inflight === 0 && !stopped) armTimer();
    }
  };

  const unsubscribe = host.subscribe(() => {
    if (inSync(buildTools(host))) return;
    schedule();
  });

  schedule();

  return {
    stop() {
      stopped = true;
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      timerResolve?.();
      timerResolve = null;
      for (const slot of slots.values()) slot.controller.abort();
      slots.clear();
    },
    async flush() {
      for (let i = 0; i < 50; i++) {
        if (stopped) return;
        await timerPromise;
        await chain;
        if (inflight > 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          continue;
        }
        if (dirty && !pumping && !stopped) {
          armTimer();
          continue;
        }
        if (!dirty && !pumping && !timer) return;
      }
    },
  };
}

const fieldDraftSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    type: { type: "string", enum: [...FIELD_KINDS] },
    field_type: { type: "string", description: "Alias for type" },
    required: { type: "boolean" },
    values: { type: "array", items: { type: "string" } },
    target: { type: "string", description: "Referenced type key (reference fields)" },
    default: {},
  },
};

export function buildTools(host: Host): ToolDefinition[] {
  const spec = host.resolvedSpec();
  const tools: ToolDefinition[] = [
    {
      name: "get_space",
      title: "Inspect space",
      description:
        "Inspect the active space: apps, actors, backend, and exposed_types. Types with expose: true live on the account space and every app here shares those records — use that for data two apps both need (clients, organisations). App-only types do not appear here. Example: get_space({}).",
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
          exposed_types: snap.sharedTypes.map((type) => ({
            key: type.key,
            label: type.label,
            fields: type.fields.map((field) => ({
              key: field.key,
              type: field.type,
              ...(field.target ? { target: field.target } : {}),
            })),
          })),
        };
      },
    },
    {
      name: "get_spec",
      title: "Inspect application spec",
      description:
        "Return the live spec, including generated default views, forms, and pages, and types the space exposes (those have expose: true — shared across apps). App-local types omit expose. Use get_space for the space-level exposed_types list. Use export_spec for the portable authored spec (defaults omitted).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => host.resolvedSpec(),
    },
    {
      name: "export_spec",
      title: "Export spec",
      description:
        "Export the portable authored spec as YAML or JSON. Generated default views, forms, and pages are omitted; they are recreated from types on import. Use get_spec to inspect the live spec including defaults.",
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
      name: "query_view",
      title: "Run a view",
      description:
        'Run a named view and return its rows. Views are how records are filtered, sorted, and limited — list_* returns every record. Discover view keys via get_spec. Example: query_view({ view: "active_projects" }).',
      inputSchema: {
        type: "object",
        properties: {
          view: { type: "string", description: "View key from get_spec" },
          expose: {
            type: "object",
            description: 'Runtime values for the view\'s expose filters, e.g. { status: "active" }',
            additionalProperties: true,
          },
          record_id: {
            type: "string",
            description: "Current record id when the view filters on $record.id",
          },
        },
        required: ["view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ view, expose, record_id }) => {
        const key = asText(view);
        const spec = host.resolvedSpec();
        const found = spec.views.find((item) => item.key === key);
        if (!found) {
          return {
            error: `Unknown view "${key}"`,
            views: spec.views.map((item) => item.key),
          };
        }
        const filters = asExpose(expose);
        if (filters && Object.keys(filters).length && !found.expose?.length) {
          return {
            error: `View "${key}" has no expose filters. Add expose on the view, or pick a view that already exposes those fields.`,
            view: key,
          };
        }
        return host.queryView(
          key,
          filters,
          record_id ? { recordId: asText(record_id) } : undefined,
        );
      },
    },
    {
      name: "apply_spec",
      title: "Apply spec",
      description:
        'Replace the entire active app spec with a YAML or JSON document. Not a merge: types, views, forms, flows, and pages missing from the document are deleted. Generated defaults are recreated from types. Requires confirm: true. A document with no types is refused unless wipe: true — { key: "foo" } is not a full spec. Example: apply_spec({ spec: "<full yaml or json>", confirm: true }).',
      inputSchema: {
        type: "object",
        properties: {
          spec: { type: "string", description: "Full YAML or JSON document for the app spec" },
          confirm: {
            type: "boolean",
            description: "Must be true. apply_spec replaces the entire spec.",
          },
          wipe: {
            type: "boolean",
            description:
              "Required with confirm if the document has no types and the app already has some.",
          },
        },
        required: ["spec", "confirm"],
        additionalProperties: false,
      },
      execute: async ({ spec, confirm, wipe }) => {
        const text = specDocument(spec);
        if (!text) {
          return { error: "apply_spec requires spec: a full YAML or JSON document." };
        }
        const current = host.app().spec;
        const summary = {
          key: current.key,
          label: current.label,
          types: current.types.map((type) => type.key),
        };
        if (confirm !== true) {
          return {
            error: "apply_spec replaces the entire app spec. Pass confirm: true to proceed.",
            current: summary,
          };
        }
        const incoming = specFromText(text);
        if (!incoming.types.length && current.types.length && wipe !== true) {
          return {
            error:
              "This spec has no types. Applying it would delete all types, views, forms, flows, and pages. Pass wipe: true if that is intended.",
            current: summary,
          };
        }
        return host.replaceSpecText(text);
      },
    },
    {
      name: "upsert_type",
      title: "Create or update a type",
      description:
        'Create or update a type and its fields. Providing fields replaces the type\'s field list; omitting fields leaves existing fields unchanged. Add or change one field with upsert_field. fields is an array of {key, type, label, ...} or a map of key → field. Reference fields need target. expose: true stores the type on the account space so every app shares the same records — use this instead of duplicating client/organisation in each app. Omit expose (or false) for app-only types. Example: upsert_type({ key: "client", expose: true, fields: [{ key: "name", type: "text", required: true }] }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          store: { type: "string" },
          expose: {
            type: "boolean",
            description:
              "If true, the type lives on the account space and all apps share its records. If false or omitted, the type belongs only to this app.",
          },
          fields: {
            description:
              "Fields to create with the type. Array of field objects, or a map of field key → field (or shorthand type string).",
            anyOf: [
              { type: "array", items: fieldDraftSchema },
              {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    { type: "string", description: "Shorthand field type, e.g. text" },
                    fieldDraftSchema,
                  ],
                },
              },
            ],
          },
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
        'Add or update one field on a type without removing the others. type is the type key; field_type is the field kind: text, number, date, boolean, enum, reference. Enum fields need values; reference fields need target. Example: upsert_field({ type: "project", key: "priority", field_type: "enum", values: ["low", "medium", "high"] }).',
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type key (not the field kind)" },
          type_key: { type: "string", description: "Alias for type" },
          key: { type: "string" },
          label: { type: "string" },
          field_type: {
            type: "string",
            enum: [...FIELD_KINDS],
            description: "Field kind",
          },
          required: { type: "boolean" },
          values: { type: "array", items: { type: "string" } },
          target: { type: "string", description: "Referenced type key (reference fields)" },
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
      description:
        'Create or update a named view (a stored query: filter, sort, limit, columns). Run it with query_view. Example: upsert_view({ key: "active_projects", source: "project", where: { status: "active" } }).',
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
      description:
        'Create or update a form over a type. Example: upsert_form({ key: "intake", type: "client", fields: ["name", "email"], mode: "create" }).',
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
        'Create or update a flow. Steps may create, set, delete, query, branch, or invoke other flows. expose: ["agent"] registers invoke_<key>. Example: upsert_flow({ key: "mark_paid", expose: ["agent"], input: { invoice: "ref(invoice)" }, steps: [{ set: { "invoice.status": "paid" } }] }).',
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
        'Create or update a page of grids and widgets. Optional folder groups it under Home. A group nests children in a blocks array even when there is only one widget. columns is how many widgets sit side by side; unused columns stay empty. Example: upsert_page({ key: "board", path: "/board", blocks: [{ kind: "group", columns: 1, blocks: [{ kind: "widget", widget: "table", values: { view: "active_projects" } }] }] }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          path: { type: "string" },
          folder: { type: "string" },
          blocks: {
            type: "array",
            description:
              "Page layout. A group nests children in a blocks array — always an array, even for one widget.",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["widget", "group"] },
                widget: { type: "string" },
                values: { type: "object" },
                columns: {
                  type: "number",
                  description: "Widgets side by side in this group (1–4). Unused cells stay empty.",
                },
                blocks: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
        required: ["key"],
        additionalProperties: false,
      },
      execute: async (input) => host.upsertPage(input as never),
    },
    {
      name: "create_app",
      title: "Create app",
      description:
        'Create an app in the active space and switch to it. The new app can use types the space already exposes (see get_space.exposed_types) — do not recreate those types in the app. Example: create_app({ name: "Invoicing" }).',
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
      description:
        "Switch the active app by id. Space-exposed types stay available; app-local types change with the app.",
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
      description:
        'Create a new account space with its own apps. After switching to it, upsert_type({ expose: true }) creates types every app in this space shares — e.g. a customer type used by both a CRM and invoicing. Example: create_space({ name: "Studio" }).',
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
        surface: "app",
        name: `list_${key}`,
        title: `List ${type.label}`,
        description: `List all ${type.label} records, unfiltered. To filter, sort, or limit, run a view with query_view.`,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => host.listRecords(key),
      },
      {
        surface: "app",
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
        surface: "app",
        name: `create_${key}`,
        title: `Create ${type.label}`,
        description: `Create a ${type.label} record. id, created_at, updated_at, created_by, and updated_by are system-managed.`,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            type.fields.map((field) => [field.key, fieldInputSchema(field)]),
          ),
          required: type.fields.filter((field) => field.required).map((field) => field.key),
          additionalProperties: false,
        },
        execute: (input) => host.create(key, input),
      },
      {
        surface: "app",
        name: `update_${key}`,
        title: `Update ${type.label}`,
        description: `Update a ${type.label} record. id, created_at, updated_at, created_by, and updated_by are system-managed.`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            ...Object.fromEntries(type.fields.map((field) => [field.key, fieldInputSchema(field)])),
          },
          required: ["id"],
          additionalProperties: false,
        },
        execute: ({ id, ...fields }) => host.update(key, String(id), fields),
      },
      {
        surface: "app",
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
    const inputs = Object.entries(flow.input ?? {});
    tools.push({
      surface: "app",
      name: `invoke_${flow.key}`,
      title: flow.label,
      description: invokeFlowDescription(flow.key, flow.label, inputs),
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          inputs.map(([name, expr]) => [name, flowInputProperty(expr)]),
        ),
        required: inputs.map(([name]) => name),
        additionalProperties: false,
      },
      execute: (input) => host.invoke(flow.key, input),
    });
  }

  return tools;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function specDocument(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function asExpose(value: unknown): Record<string, unknown> | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    try {
      return asExpose(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function jsonSchemaType(kind: string): string {
  if (kind === "number") return "number";
  if (kind === "boolean") return "boolean";
  return "string";
}

function fieldInputSchema(field: FieldDef): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: jsonSchemaType(field.type),
    description: fieldInputDescription(field),
  };
  if (field.type === "enum" && field.values?.length) schema.enum = field.values;
  return schema;
}

function fieldInputDescription(field: FieldDef): string {
  if (field.type === "reference") {
    const target = field.target || "record";
    return `${field.label} — id of a ${target} record`;
  }
  if (field.type === "enum" && field.values?.length) {
    return `${field.label}. One of: ${field.values.join(", ")}`;
  }
  return field.label;
}

function flowInputProperty(expr: unknown): Record<string, unknown> {
  const text = String(expr ?? "");
  const match = /^ref\(([^)]+)\)$/.exec(text.trim());
  if (match) {
    return { type: "string", description: `id of a ${match[1]} record` };
  }
  return { type: "string", description: text };
}

function invokeFlowDescription(
  key: string,
  label: string,
  inputs: Array<[string, unknown]>,
): string {
  const args = inputs
    .map(([name, expr]) => {
      const match = /^ref\(([^)]+)\)$/.exec(String(expr ?? "").trim());
      return match ? `${name}: <${match[1]} id>` : `${name}: <value>`;
    })
    .join(", ");
  const example = args ? ` Example: invoke_${key}({ ${args} }).` : ` Example: invoke_${key}({}).`;
  return `Invoke the ${label} flow (${key}).${example}`;
}
