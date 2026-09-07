import type { Host } from "./host.ts";
import { BROWSER_LOCAL_AUTOMATION_PROFILE } from "./automation/capabilities.ts";
import { DEFAULT_AUTOMATION_REGISTRY } from "./automation/registry.ts";
import { cloneData, FIELD_KINDS, type FieldDef } from "./model.ts";
import { sampleApps } from "./samples.ts";
import { PAGE_ICON_KEYS } from "./page-icons.ts";
import { specFromText } from "./serialize.ts";
import { describeWidget, widgets } from "./widgets.ts";

export type ToolSurface = "builder" | "app";

export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  surface?: ToolSurface;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown;
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
    key: { type: "string", minLength: 1, pattern: "\\S" },
    label: { type: "string" },
    type: { type: "string", enum: [...FIELD_KINDS] },
    field_type: { type: "string", description: "Alias for type" },
    required: { type: "boolean" },
    values: { type: "array", items: { type: "string" } },
    target: { type: "string", description: "Referenced type key (reference fields)" },
    presentation: { type: "string", enum: ["rating", "badge"] },
    variant: { type: "string", enum: ["segments"] },
    max: { type: "number", minimum: 2, maximum: 10 },
    value_semantics: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: ["neutral", "info", "success", "warning", "danger"],
      },
    },
    default: {},
  },
};

const lifecycleSchema = {
  type: "object",
  description: "Optional state machine attached to one enum field",
  properties: {
    field: { type: "string", description: "Enum field containing the current state" },
    initial: { type: "string", description: "State assigned to every new record" },
    terminal: { type: "array", items: { type: "string" } },
    transitions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", minLength: 1 },
          label: { type: "string" },
          from: { type: "array", minItems: 1, items: { type: "string" } },
          to: { type: "string" },
        },
        required: ["key", "from", "to"],
        additionalProperties: false,
      },
    },
  },
  required: ["field", "initial", "transitions"],
  additionalProperties: false,
};

const viewMeasuresSchema = {
  type: "object",
  description: "Named live aggregates for a grouped view",
  additionalProperties: {
    type: "object",
    properties: {
      op: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
      field: { type: "string" },
      fields: { type: "array", items: { type: "string" } },
    },
    required: ["op"],
    additionalProperties: false,
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
      name: "get_widgets",
      title: "Inspect page widgets",
      description:
        "Discover page widgets and their configuration contract. Call without widget to list or search widgets. Pass a widget key for its inputs. Also pass view for exact compatible field options before calling upsert_page.",
      inputSchema: {
        type: "object",
        properties: {
          widget: { type: "string", description: "Widget key to inspect" },
          view: {
            type: "string",
            description: "Optional View key used to resolve compatible field inputs",
          },
          query: { type: "string", description: "Optional text search when listing widgets" },
          category: {
            type: "string",
            enum: ["content", "data", "actions"],
            description: "Optional category filter when listing widgets",
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: ({ widget, view, query, category }) => {
        const key = asText(widget);
        if (!key) {
          const needle = asText(query).trim().toLowerCase();
          const categoryKey = asText(category);
          const matching = widgets.filter((item) => {
            if (categoryKey && item.category !== categoryKey) return false;
            if (!needle) return true;
            return `${item.key} ${item.label} ${item.description}`.toLowerCase().includes(needle);
          });
          return {
            total: matching.length,
            widgets: matching.slice(0, 25).map((item) => ({
              key: item.key,
              label: item.label,
              description: item.description,
              category: item.category,
            })),
            next:
              matching.length > 25
                ? "Refine query or category, then call get_widgets with a widget key and optional view key."
                : "Call get_widgets with a widget key and, for data widgets, a view key.",
          };
        }
        const spec = host.resolvedSpec();
        const viewKey = asText(view);
        if (viewKey && !spec.views.some((item) => item.key === viewKey)) {
          return {
            error: `Unknown view "${viewKey}"`,
            views: spec.views.map((item) => item.key),
          };
        }
        return describeWidget(spec, key, viewKey ? { view: viewKey } : {});
      },
    },
    {
      name: "get_automation_primitives",
      title: "Inspect automation primitives",
      description:
        "Discover the canonical structured-flow grammar, registered conditions and effects, and this runtime's capability profile. Call with a condition or effect key for its parameter contract before authoring a flow.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["condition", "effect"] },
          key: { type: "string" },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: ({ kind, key }) => {
        const category = asText(kind);
        const itemKey = asText(key);
        const conditions = [...DEFAULT_AUTOMATION_REGISTRY.conditions.values()];
        const effects = [...DEFAULT_AUTOMATION_REGISTRY.effects.values()];
        if (itemKey) {
          const item =
            category === "condition"
              ? DEFAULT_AUTOMATION_REGISTRY.conditions.get(itemKey)
              : category === "effect"
                ? DEFAULT_AUTOMATION_REGISTRY.effects.get(itemKey)
                : (DEFAULT_AUTOMATION_REGISTRY.conditions.get(itemKey) ??
                  DEFAULT_AUTOMATION_REGISTRY.effects.get(itemKey));
          return item ?? { error: `Unknown automation primitive "${itemKey}"` };
        }
        return {
          inputs: {
            record: { record: "type_key", required: "boolean (default true)" },
            scalar: {
              value: "text | number | boolean | date | object | array",
              required: "boolean (default true)",
              default: "optional JSON value",
            },
          },
          binding: { $ref: "vars.name or another context path" },
          steps: {
            effect: "{ effect: { key, params?, as?, retry?, compensate? } }",
            gate: "{ gate: { predicate, pass?: steps, fail?: steps } }",
            compute: "{ compute: { assign } }",
            invoke: "{ invoke: { flow, input?, as? } }",
            foreach: "{ foreach: { source: {$ref}, as?, max?, on_item_failure?, steps } }",
            repeat: "{ repeat: { times, as?, max?, on_item_failure?, steps } }",
            parallel: "{ parallel: { branches: [{key?, steps}], join?: all|any } }",
            delay: "{ delay: { duration } }",
            wait: "{ wait: { signal?, timeout?, as?, on_signal?, on_timeout? } }",
          },
          conditions,
          effects,
          runtime: BROWSER_LOCAL_AUTOMATION_PROFILE,
          next: "Inspect any unfamiliar key, then call upsert_flow with the canonical nested structure.",
        };
      },
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
        'Run a named view and return its rows. Views can filter, sort, limit, and derive live grouped measures — list_* returns every source record. Discover view keys via get_spec. Example: query_view({ view: "active_projects" }).',
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
        'Create or update a type and its fields. Use a singular key and label for one record; optional collection_label overrides the automatically pluralized list name. Providing fields replaces the type\'s field list; omitting fields leaves existing fields unchanged. lifecycle optionally turns one enum field into a validated state machine with an initial state, terminal states, and named transitions. Add or change one field with upsert_field. Enum fields can use presentation: "badge" and explicit value_semantics; number fields can use presentation: "rating". Reference fields need target. expose: true stores the type on the account space so every app shares its records. Example: upsert_type({ key: "task", fields: [{ key: "status", type: "enum", values: ["draft", "done"] }], lifecycle: { field: "status", initial: "draft", terminal: ["done"], transitions: [{ key: "complete", from: ["draft"], to: "done" }] } }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", minLength: 1, pattern: "\\S" },
          label: { type: "string" },
          collection_label: {
            type: "string",
            description:
              "Optional plural label for lists and navigation. Omit it to infer an English plural from label; pass an empty string to clear an existing override.",
          },
          store: { type: "string" },
          expose: {
            type: "boolean",
            description:
              "If true, the type lives on the account space and all apps share its records. If false or omitted, the type belongs only to this app.",
          },
          lifecycle: {
            anyOf: [lifecycleSchema, { type: "null" }],
            description: "State machine definition, or null to remove the existing lifecycle",
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
        'Add or update one field on a type without removing the others. type is the type key; field_type is the field kind: text, number, date, boolean, enum, reference. Enum fields need values and can use presentation: "badge" with explicit value_semantics of neutral, info, success, warning, or danger; use neutral when meaning is unclear. Reference fields need target. A number field can use presentation: "rating", variant: "segments", and max from 2 to 10. Example: upsert_field({ type: "submission", key: "stage", field_type: "enum", values: ["submitted", "winner", "rejected"], presentation: "badge", value_semantics: { submitted: "neutral", winner: "success", rejected: "danger" } }).',
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type key (not the field kind)" },
          type_key: { type: "string", description: "Alias for type" },
          key: { type: "string", minLength: 1, pattern: "\\S" },
          label: { type: "string" },
          field_type: {
            type: "string",
            enum: [...FIELD_KINDS],
            description: "Field kind",
          },
          required: { type: "boolean" },
          values: { type: "array", items: { type: "string" } },
          target: { type: "string", description: "Referenced type key (reference fields)" },
          presentation: { type: "string", enum: ["rating", "badge"] },
          variant: { type: "string", enum: ["segments"] },
          max: { type: "number", minimum: 2, maximum: 10 },
          value_semantics: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: ["neutral", "info", "success", "warning", "danger"],
            },
          },
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
          ...(Object.hasOwn(input, "presentation")
            ? { presentation: input.presentation as FieldDef["presentation"] }
            : {}),
          ...(Object.hasOwn(input, "variant")
            ? { variant: input.variant as FieldDef["variant"] }
            : {}),
          ...(Object.hasOwn(input, "max") ? { max: input.max as number } : {}),
          ...(Object.hasOwn(input, "value_semantics")
            ? { value_semantics: input.value_semantics as FieldDef["value_semantics"] }
            : {}),
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
          to: { type: "string", minLength: 1, pattern: "\\S" },
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
        'Create or update a named view (a stored query: filter, sort, limit, columns, or live grouped measures). For a normal view, include fields in the order people should see them, such as fields: ["name", "status", "client.name"]. If fields is omitted while creating a normal view, builder.run chooses up to six useful source fields automatically; an empty fields array is invalid. Omitting fields while updating preserves the existing selection. For a grouped view, omit fields to derive them from group_by and measure aliases. group_by accepts one source field. measures supports count, sum, avg, min, and max; avg accepts field or fields. Sort aggregate aliases with order_by. Run it with query_view. Example: upsert_view({ key: "scores", source: "review", group_by: "submission", measures: { review_count: { op: "count" }, overall_score: { op: "avg", fields: ["quality", "impact"] } }, order_by: { overall_score: "desc" } }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          source: { type: "string" },
          fields: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
            description:
              "Ordered visible columns for a normal view. Reference labels may use paths such as client.name. Omit on creation to infer useful defaults; omit on update to preserve existing columns; omit for grouped views to derive aggregate columns.",
          },
          where: { type: "object" },
          expose: { type: "array", items: { type: "string" } },
          limit: { type: "number" },
          order_by: { type: "object" },
          group_by: { type: "string" },
          measures: viewMeasuresSchema,
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
        'Create or update a structured flow. Call get_automation_primitives first. Use registered effects and {$ref:"vars.name"} bindings. Gates contain pass/fail steps; loops and parallel branches contain their own steps. expose: ["agent"] registers invoke_<key>. Example: upsert_flow({ key: "mark_paid", expose: ["agent"], input: { invoice: { record: "invoice" } }, steps: [{ effect: { key: "records.set", params: { record: {$ref:"vars.invoice"}, values: {status:"paid"} } } }] }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          enabled: { type: "boolean" },
          priority: { type: "integer" },
          input: {
            type: "object",
            description:
              'Named inputs. Each value is {record:"type_key"} or {value:"text|number|boolean|date|object|array"}.',
          },
          trigger: {
            type: "object",
            description: "Optional {key, config?}. Omit for a callable flow.",
          },
          expose: { type: "array", items: { type: "string", enum: ["ui", "agent"] } },
          steps: {
            type: "array",
            description: "Canonical nested steps returned by get_automation_primitives.",
          },
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
        'Create or update a page of grids and widgets. Call get_widgets first to discover widget keys, required values, and compatible fields. Widget values are validated against that contract. Optional folder groups it in the app menu. Optional icon is one of: page, dashboard, table, chart, line, donut, board, calendar, list, inbox, people, money, time. If icon is omitted when creating a page, a one-time default is inferred from its widgets; later edits do not change it. A group nests children in a blocks array even when there is only one widget. columns is how many widgets sit side by side; unused columns stay empty. Example: upsert_page({ key: "board", icon: "board", path: "/board", blocks: [{ kind: "group", columns: 1, blocks: [{ kind: "widget", widget: "table", values: { view: "active_projects" } }] }] }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          path: { type: "string" },
          folder: { type: "string" },
          icon: {
            type: "string",
            enum: [...PAGE_ICON_KEYS],
            description: "Sidebar icon for this page.",
          },
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
        if (sample) return host.loadSample(asText(sample), asText(name));
        return host.createApp(asText(name));
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
        description: `Create a ${type.label} record. id, created_at, updated_at, created_by, updated_by${type.lifecycle ? `, and ${type.lifecycle.field}` : ""} are system-managed.`,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            type.fields.map((field) => [field.key, fieldInputSchema(field)]),
          ),
          required: type.fields
            .filter((field) => field.required && field.key !== type.lifecycle?.field)
            .map((field) => field.key),
          additionalProperties: false,
        },
        execute: (input) => host.create(key, input),
      },
      {
        surface: "app",
        name: `update_${key}`,
        title: `Update ${type.label}`,
        description: `Update a ${type.label} record. id, created_at, updated_at, created_by, and updated_by are system-managed.${type.lifecycle ? ` Changes to ${type.lifecycle.field} must follow a configured transition; prefer transition_${key}.` : ""}`,
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
    if (type.lifecycle) {
      tools.push({
        surface: "app",
        name: `transition_${key}`,
        title: `Transition ${type.label}`,
        description: `Apply one named ${type.label} lifecycle transition. Availability depends on the record's current ${type.lifecycle.field} value.`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            transition: {
              type: "string",
              enum: type.lifecycle.transitions.map((transition) => transition.key),
              description: type.lifecycle.transitions
                .map(
                  (transition) =>
                    `${transition.key}: ${transition.from.join(" | ")} → ${transition.to}`,
                )
                .join("; "),
            },
          },
          required: ["id", "transition"],
          additionalProperties: false,
        },
        execute: ({ id, transition }) => host.transition(key, String(id), String(transition)),
      });
    }
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
          inputs.map(([name, definition]) => [name, flowInputProperty(definition)]),
        ),
        required: inputs
          .filter(([, definition]) => definition.required !== false)
          .map(([name]) => name),
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
  if (field.type === "number" && field.presentation === "rating") {
    schema.minimum = 1;
    schema.maximum = field.max ?? 10;
    schema.multipleOf = 1;
  }
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
  if (field.type === "number" && field.presentation === "rating") {
    return `${field.label}. A whole-number rating from 1 to ${field.max ?? 10}`;
  }
  return field.label;
}

function flowInputProperty(definition: unknown): Record<string, unknown> {
  if (definition && typeof definition === "object" && "record" in definition) {
    return { type: "string", description: `id of a ${String(definition.record)} record` };
  }
  if (definition && typeof definition === "object" && "value" in definition) {
    const kind = String(definition.value);
    if (kind === "number" || kind === "boolean" || kind === "object" || kind === "array")
      return { type: kind };
  }
  return { type: "string" };
}

function invokeFlowDescription(
  key: string,
  label: string,
  inputs: Array<[string, unknown]>,
): string {
  const args = inputs
    .map(([name, definition]) => {
      const record =
        definition && typeof definition === "object" && "record" in definition
          ? String(definition.record)
          : "";
      return record ? `${name}: <${record} id>` : `${name}: <value>`;
    })
    .join(", ");
  const example = args ? ` Example: invoke_${key}({ ${args} }).` : ` Example: invoke_${key}({}).`;
  return `Invoke the ${label} flow (${key}).${example}`;
}
