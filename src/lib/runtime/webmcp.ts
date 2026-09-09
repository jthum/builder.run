import type { Host } from "./host.ts";
import { BROWSER_LOCAL_AUTOMATION_PROFILE } from "./automation/capabilities.ts";
import { DEFAULT_AUTOMATION_REGISTRY } from "./automation/registry.ts";
import {
  cloneData,
  FIELD_FORMATS,
  FIELD_KINDS,
  FIELD_PRESENTATIONS,
  VALUE_SEMANTICS,
  type FieldDef,
  type TypeDef,
} from "./model.ts";
import { sampleApps } from "./samples.ts";
import { PAGE_ICON_KEYS } from "./page-icons.ts";
import { specFromText } from "./serialize.ts";
import { describeWidget, widgets } from "./widgets.ts";

export type ToolSurface = "builder" | "app";
export type WebMcpAppToolMode = "compact" | "typed";

export const DEFAULT_WEBMCP_APP_TOOL_MODE: WebMcpAppToolMode = "compact";
const WEBMCP_APP_TOOL_MODE_KEY = "builder.run:webmcp-app-tools";
const WEBMCP_APP_TOOL_MODE_EVENT = "builder-run-webmcp-app-tools";

export function getWebMcpAppToolMode(): WebMcpAppToolMode {
  if (typeof localStorage === "undefined") return DEFAULT_WEBMCP_APP_TOOL_MODE;
  try {
    return localStorage.getItem(WEBMCP_APP_TOOL_MODE_KEY) === "typed" ? "typed" : "compact";
  } catch {
    return DEFAULT_WEBMCP_APP_TOOL_MODE;
  }
}

export function setWebMcpAppToolMode(mode: WebMcpAppToolMode): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(WEBMCP_APP_TOOL_MODE_KEY, mode);
    } catch {
      // The active page still updates even when storage is unavailable.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WEBMCP_APP_TOOL_MODE_EVENT, { detail: mode }));
  }
}

function subscribeWebMcpAppToolMode(listener: (mode: WebMcpAppToolMode) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const receive = (event: Event) => {
    const mode = (event as CustomEvent<unknown>).detail;
    if (mode === "compact" || mode === "typed") listener(mode);
  };
  window.addEventListener(WEBMCP_APP_TOOL_MODE_EVENT, receive);
  return () => window.removeEventListener(WEBMCP_APP_TOOL_MODE_EVENT, receive);
}

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

export interface WebMcpBridgeOptions {
  appTools?: WebMcpAppToolMode;
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

export function createWebMcpBridge(
  host: Host,
  registry?: WebMcpToolRegistry | null,
  options: WebMcpBridgeOptions = {},
): WebMcpBridge {
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
  let appToolMode = options.appTools ?? getWebMcpAppToolMode();
  const currentTools = () => buildTools(host, { appTools: appToolMode });

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
    const tools = currentTools();
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
    if (inSync(currentTools())) return;
    schedule();
  });
  const unsubscribeMode = options.appTools
    ? () => {}
    : subscribeWebMcpAppToolMode((mode) => {
        if (mode === appToolMode) return;
        appToolMode = mode;
        schedule();
      });

  schedule();

  return {
    stop() {
      stopped = true;
      unsubscribe();
      unsubscribeMode();
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
    meta: { type: "object", additionalProperties: true },
    description: { type: "string" },
    placeholder: { type: "string" },
    type: { type: "string", enum: [...FIELD_KINDS] },
    required: { type: "boolean" },
    values: { type: "array", items: { type: "string" } },
    target: { type: "string", description: "Referenced type key (reference fields)" },
    format: { type: "string", enum: [...FIELD_FORMATS] },
    currency: { type: "string", pattern: "^[A-Za-z]{3}$" },
    presentation: { type: "string", enum: [...FIELD_PRESENTATIONS] },
    variant: { type: "string", enum: ["segments"] },
    max: { type: "number", minimum: 2, maximum: 10 },
    value_semantics: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: [...VALUE_SEMANTICS],
      },
    },
    default: {},
    validation: { type: "object", additionalProperties: true },
    visible_when: { type: "object", additionalProperties: true },
    enabled_when: { type: "object", additionalProperties: true },
    required_when: { type: "object", additionalProperties: true },
    hidden_value: { type: "string", enum: ["preserve", "clear"] },
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
          description: { type: "string" },
          placeholder: { type: "string" },
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

export interface BuildToolsOptions {
  appTools?: WebMcpAppToolMode;
}

export function buildTools(host: Host, options: BuildToolsOptions = {}): ToolDefinition[] {
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
        "Discover the canonical structured-workflow grammar, registered conditions and effects, and this runtime's capability profile. Call with a condition or effect key for its parameter contract before authoring a workflow.",
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
            invoke: "{ invoke: { workflow, input?, as? } }",
            foreach: "{ foreach: { source: {$ref}, as?, max?, on_item_failure?, steps } }",
            repeat: "{ repeat: { times, as?, max?, on_item_failure?, steps } }",
            parallel: "{ parallel: { branches: [{key?, steps}], join?: all|any } }",
            delay: "{ delay: { duration } }",
            wait: "{ wait: { signal?, timeout?, as?, on_signal?, on_timeout? } }",
          },
          conditions,
          effects,
          runtime: BROWSER_LOCAL_AUTOMATION_PROFILE,
          next: "Inspect any unfamiliar key, then call upsert_workflow with the canonical nested structure.",
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
      surface: "app",
      name: "query_view",
      title: "Run a view",
      description:
        'Run a named view and return its rows. Views can filter, sort, limit, and derive live grouped measures — list_records returns every source record (list_<type> in typed mode). Discover view keys via get_spec. Example: query_view({ view: "active_projects" }).',
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
        'Replace the entire active app spec with a YAML or JSON document. Not a merge: types, views, forms, workflows, and pages missing from the document are deleted. Generated defaults are recreated from types. Requires confirm: true. A document with no types is refused unless wipe: true — { key: "foo" } is not a full spec. Example: apply_spec({ spec: "<full yaml or json>", confirm: true }).',
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
              "This spec has no types. Applying it would delete all types, views, forms, workflows, and pages. Pass wipe: true if that is intended.",
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
        'Create or update a type and its fields. Use a singular key and label for one record; optional collection_label overrides the automatically pluralized list name. Providing fields replaces the type\'s field list; omitting fields leaves existing fields unchanged. Field type is canonical; compatible format, presentation, validation, and conditional behavior are optional. lifecycle turns one enum field into a validated state machine. Add or change one field with upsert_field. expose: true stores the type on the account space so every app shares its records. Example: upsert_type({ key: "task", fields: [{ key: "status", type: "enum", values: ["draft", "done"] }], lifecycle: { field: "status", initial: "draft", terminal: ["done"], transitions: [{ key: "complete", from: ["draft"], to: "done" }] } }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", minLength: 1, pattern: "\\S" },
          label: { type: "string" },
          meta: { type: "object", additionalProperties: true },
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
        'Add or update one field without replacing the type\'s other fields. type identifies the record type; kind is the field kind. Formats, presentations, and validation must be compatible with that kind. Enum fields need values, reference fields need target, currency fields need currency, and rating fields use max from 2 to 10. Example: upsert_field({ type: "submission", key: "stage", kind: "enum", values: ["submitted", "winner", "rejected"], presentation: "badge", value_semantics: { submitted: "neutral", winner: "success", rejected: "danger" } }).',
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type key (not the field kind)" },
          key: { type: "string", minLength: 1, pattern: "\\S" },
          label: { type: "string" },
          meta: { type: "object", additionalProperties: true },
          kind: {
            type: "string",
            enum: [...FIELD_KINDS],
            description: "Field kind",
          },
          required: { type: "boolean" },
          values: { type: "array", items: { type: "string" } },
          target: { type: "string", description: "Referenced type key (reference fields)" },
          format: { type: "string", enum: [...FIELD_FORMATS] },
          currency: { type: "string", pattern: "^[A-Za-z]{3}$" },
          presentation: { type: "string", enum: [...FIELD_PRESENTATIONS] },
          variant: { type: "string", enum: ["segments"] },
          max: { type: "number", minimum: 2, maximum: 10 },
          value_semantics: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: [...VALUE_SEMANTICS],
            },
          },
          validation: { type: "object", additionalProperties: true },
          visible_when: { type: "object", additionalProperties: true },
          enabled_when: { type: "object", additionalProperties: true },
          required_when: { type: "object", additionalProperties: true },
          hidden_value: { type: "string", enum: ["preserve", "clear"] },
        },
        required: ["type", "key"],
        additionalProperties: false,
      },
      execute: async (input) =>
        host.upsertField(String(input.type), {
          key: String(input.key),
          ...(Object.hasOwn(input, "label") ? { label: input.label as string } : {}),
          ...(Object.hasOwn(input, "meta") ? { meta: input.meta as FieldDef["meta"] } : {}),
          ...(Object.hasOwn(input, "description")
            ? { description: input.description as string }
            : {}),
          ...(Object.hasOwn(input, "placeholder")
            ? { placeholder: input.placeholder as string }
            : {}),
          ...(Object.hasOwn(input, "kind") ? { type: input.kind as never } : {}),
          ...(Object.hasOwn(input, "required") ? { required: Boolean(input.required) } : {}),
          ...(Object.hasOwn(input, "values") ? { values: input.values as string[] } : {}),
          ...(Object.hasOwn(input, "target") ? { target: input.target as string } : {}),
          ...(Object.hasOwn(input, "format") ? { format: input.format as FieldDef["format"] } : {}),
          ...(Object.hasOwn(input, "currency") ? { currency: input.currency as string } : {}),
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
          ...(Object.hasOwn(input, "validation")
            ? { validation: input.validation as FieldDef["validation"] }
            : {}),
          ...(Object.hasOwn(input, "visible_when")
            ? { visible_when: input.visible_when as FieldDef["visible_when"] }
            : {}),
          ...(Object.hasOwn(input, "enabled_when")
            ? { enabled_when: input.enabled_when as FieldDef["enabled_when"] }
            : {}),
          ...(Object.hasOwn(input, "required_when")
            ? { required_when: input.required_when as FieldDef["required_when"] }
            : {}),
          ...(Object.hasOwn(input, "hidden_value")
            ? { hidden_value: input.hidden_value as FieldDef["hidden_value"] }
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
          meta: { type: "object", additionalProperties: true },
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
          meta: { type: "object", additionalProperties: true },
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
      name: "upsert_workflow",
      title: "Create or update a workflow",
      description:
        'Create or update a structured workflow. Call get_automation_primitives first. Use registered effects and {$ref:"vars.name"} bindings. Gates contain pass/fail steps; loops and parallel branches contain their own steps. expose: ["agent"] registers invoke_<key>. Example: upsert_workflow({ key: "mark_paid", expose: ["agent"], input: { invoice: { record: "invoice" } }, steps: [{ effect: { key: "records.set", params: { record: {$ref:"vars.invoice"}, values: {status:"paid"} } } }] }).',
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          meta: { type: "object", additionalProperties: true },
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
            description: "Optional {key, config?}. Omit for a callable workflow.",
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
      execute: async (input) => host.upsertWorkflow(input as never),
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
          meta: { type: "object", additionalProperties: true },
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

  tools.push(...(options.appTools === "typed" ? typedRecordTools(host) : compactRecordTools(host)));

  for (const workflow of spec.workflows) {
    if (!workflow.expose?.includes("agent")) continue;
    const inputs = Object.entries(workflow.input ?? {});
    tools.push({
      surface: "app",
      name: `invoke_${workflow.key}`,
      title: workflow.label,
      description: invokeWorkflowDescription(workflow.key, workflow.label, inputs),
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
      execute: (input) => host.invoke(workflow.key, input),
    });
  }

  return tools;
}

interface RecordOperations {
  describe(typeKey: string, id?: string): Promise<Record<string, unknown>>;
  list(typeKey: string): ReturnType<Host["listRecords"]>;
  get(typeKey: string, id: string): ReturnType<Host["getRecord"]>;
  create(typeKey: string, values: Record<string, unknown>): ReturnType<Host["create"]>;
  update(typeKey: string, id: string, values: Record<string, unknown>): ReturnType<Host["update"]>;
  remove(typeKey: string, id: string): Promise<{ ok: true }>;
  transition(typeKey: string, id: string, transition: string): ReturnType<Host["transition"]>;
}

function requireAppType(host: Host, typeKey: string): TypeDef {
  const type = host.resolvedSpec().types.find((item) => item.key === typeKey);
  if (type) return type;
  const available = host
    .resolvedSpec()
    .types.map((item) => item.key)
    .join(", ");
  throw new Error(
    available
      ? `Unknown type "${typeKey}". Available types: ${available}`
      : `Unknown type "${typeKey}". This app has no types yet.`,
  );
}

function recordValues(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("values must be an object");
  }
  return value as Record<string, unknown>;
}

function recordOperations(host: Host): RecordOperations {
  return {
    async describe(typeKey, id) {
      const type = requireAppType(host, typeKey);
      const record = id ? await host.getRecord(type.key, id) : undefined;
      if (id && !record) throw new Error(`${type.label} ${id} not found`);
      const currentState =
        record && type.lifecycle ? asText(record[type.lifecycle.field]) : undefined;
      return {
        key: type.key,
        label: type.label,
        collection_label: type.collection_label,
        scope: type.expose ? "space" : "app",
        fields: type.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          ...(field.required ? { required: true } : {}),
          ...(field.description ? { description: field.description } : {}),
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(field.default !== undefined ? { default: cloneData(field.default) } : {}),
          ...(field.values ? { values: [...field.values] } : {}),
          ...(field.target ? { target: field.target } : {}),
          ...(field.format ? { format: field.format } : {}),
          ...(field.currency ? { currency: field.currency } : {}),
          ...(field.presentation ? { presentation: field.presentation } : {}),
          ...(field.variant ? { variant: field.variant } : {}),
          ...(field.max ? { max: field.max } : {}),
          ...(field.value_semantics ? { value_semantics: cloneData(field.value_semantics) } : {}),
          ...(field.validation ? { validation: cloneData(field.validation) } : {}),
          ...(field.visible_when ? { visible_when: cloneData(field.visible_when) } : {}),
          ...(field.enabled_when ? { enabled_when: cloneData(field.enabled_when) } : {}),
          ...(field.required_when ? { required_when: cloneData(field.required_when) } : {}),
          ...(field.hidden_value === "clear" ? { hidden_value: "clear" } : {}),
        })),
        ...(type.lifecycle ? { lifecycle: cloneData(type.lifecycle) } : {}),
        ...(record
          ? {
              record,
              ...(type.lifecycle
                ? {
                    current_state: currentState,
                    available_transitions: type.lifecycle.transitions
                      .filter((transition) => transition.from.includes(currentState ?? ""))
                      .map((transition) => ({
                        key: transition.key,
                        label: transition.label,
                        to: transition.to,
                      })),
                  }
                : {}),
            }
          : {}),
      };
    },
    list(typeKey) {
      requireAppType(host, typeKey);
      return host.listRecords(typeKey);
    },
    get(typeKey, id) {
      const type = requireAppType(host, typeKey);
      return host.getRecord(type.key, id);
    },
    create(typeKey, values) {
      const type = requireAppType(host, typeKey);
      return host.create(type.key, values);
    },
    update(typeKey, id, values) {
      const type = requireAppType(host, typeKey);
      return host.update(type.key, id, values);
    },
    async remove(typeKey, id) {
      const type = requireAppType(host, typeKey);
      await host.remove(type.key, id);
      return { ok: true };
    },
    transition(typeKey, id, transition) {
      const type = requireAppType(host, typeKey);
      return host.transition(type.key, id, transition);
    },
  };
}

function describeTypeTool(operations: RecordOperations): ToolDefinition {
  return {
    surface: "app",
    name: "describe_type",
    title: "Describe a record type",
    description:
      "Inspect one record type on demand, including field constraints and lifecycle transitions. Pass a record id to also see its current state and available transitions. Call this before creating or updating unfamiliar records.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Type key from get_spec" },
        id: { type: "string", description: "Optional record id" },
      },
      required: ["type"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: ({ type, id }) => operations.describe(asText(type), id ? asText(id) : undefined),
  };
}

function compactRecordTools(host: Host): ToolDefinition[] {
  const operations = recordOperations(host);
  const typeProperty = { type: "string", description: "Type key from get_spec or describe_type" };
  const idProperty = { type: "string", description: "Record id" };
  const valuesProperty = {
    type: "object",
    description: "Field values accepted by the selected type. Use describe_type for the contract.",
    additionalProperties: true,
  };

  return [
    describeTypeTool(operations),
    {
      surface: "app",
      name: "list_records",
      title: "List records",
      description:
        "List every record of one type, unfiltered. Use query_view when you need filtering, sorting, limits, or aggregates.",
      inputSchema: {
        type: "object",
        properties: { type: typeProperty },
        required: ["type"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: ({ type }) => operations.list(asText(type)),
    },
    {
      surface: "app",
      name: "get_record",
      title: "Get a record",
      description: "Get one record by type and id.",
      inputSchema: {
        type: "object",
        properties: { type: typeProperty, id: idProperty },
        required: ["type", "id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: ({ type, id }) => operations.get(asText(type), asText(id)),
    },
    {
      surface: "app",
      name: "create_record",
      title: "Create a record",
      description:
        "Create a record of one type. Call describe_type first for fields and constraints; lifecycle state and audit fields are system-managed.",
      inputSchema: {
        type: "object",
        properties: { type: typeProperty, values: valuesProperty },
        required: ["type", "values"],
        additionalProperties: false,
      },
      execute: ({ type, values }) => operations.create(asText(type), recordValues(values)),
    },
    {
      surface: "app",
      name: "update_record",
      title: "Update a record",
      description:
        "Update fields on one record. Call describe_type first; use transition_record for lifecycle state changes.",
      inputSchema: {
        type: "object",
        properties: { type: typeProperty, id: idProperty, values: valuesProperty },
        required: ["type", "id", "values"],
        additionalProperties: false,
      },
      execute: ({ type, id, values }) =>
        operations.update(asText(type), asText(id), recordValues(values)),
    },
    {
      surface: "app",
      name: "delete_record",
      title: "Delete a record",
      description: "Delete one record by type and id.",
      inputSchema: {
        type: "object",
        properties: { type: typeProperty, id: idProperty },
        required: ["type", "id"],
        additionalProperties: false,
      },
      execute: ({ type, id }) => operations.remove(asText(type), asText(id)),
    },
    {
      surface: "app",
      name: "transition_record",
      title: "Transition a record",
      description:
        "Apply a named lifecycle transition to a record. Use describe_type with the record id to discover transitions currently available.",
      inputSchema: {
        type: "object",
        properties: {
          type: typeProperty,
          id: idProperty,
          transition: { type: "string", description: "Lifecycle transition key" },
        },
        required: ["type", "id", "transition"],
        additionalProperties: false,
      },
      execute: ({ type, id, transition }) =>
        operations.transition(asText(type), asText(id), asText(transition)),
    },
  ];
}

function typedRecordTools(host: Host): ToolDefinition[] {
  const operations = recordOperations(host);
  const tools = [describeTypeTool(operations)];

  for (const type of host.resolvedSpec().types) {
    const key = type.key;
    const createFields = type.fields.filter((field) => field.key !== type.lifecycle?.field);
    tools.push(
      {
        surface: "app",
        name: `list_${key}`,
        title: `List ${type.label}`,
        description: `List all ${type.label} records, unfiltered. To filter, sort, or limit, run a view with query_view.`,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => operations.list(key),
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
        execute: ({ id }) => operations.get(key, asText(id)),
      },
      {
        surface: "app",
        name: `create_${key}`,
        title: `Create ${type.label}`,
        description: `Create a ${type.label} record. id, created_at, updated_at, created_by, updated_by${type.lifecycle ? `, and ${type.lifecycle.field}` : ""} are system-managed.`,
        inputSchema: {
          type: "object",
          properties: Object.fromEntries(
            createFields.map((field) => [field.key, fieldInputSchema(field)]),
          ),
          required: createFields.filter((field) => field.required).map((field) => field.key),
          additionalProperties: false,
        },
        execute: (input) => operations.create(key, input),
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
        execute: ({ id, ...fields }) => operations.update(key, asText(id), fields),
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
        execute: ({ id }) => operations.remove(key, asText(id)),
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
        execute: ({ id, transition }) => operations.transition(key, asText(id), asText(transition)),
      });
    }
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
  if (field.format === "email") schema.format = "email";
  if (field.format === "url") schema.format = "uri";
  if (field.validation?.min !== undefined) schema.minimum = field.validation.min;
  if (field.validation?.max !== undefined) schema.maximum = field.validation.max;
  if (field.validation?.min_length !== undefined) schema.minLength = field.validation.min_length;
  if (field.validation?.max_length !== undefined) schema.maxLength = field.validation.max_length;
  if (field.validation?.pattern) schema.pattern = field.validation.pattern;
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
  return field.description ? `${field.label} — ${field.description}` : field.label;
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

function invokeWorkflowDescription(
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
  return `Invoke the ${label} workflow (${key}).${example}`;
}
