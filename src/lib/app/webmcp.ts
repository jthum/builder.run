import type { AppRuntime } from "$lib/framework/bootstrap.ts";
import { launchRule } from "@jthum/framework/client";
import { FrameworkError, ERROR_CODES } from "@jthum/framework/errors";
import type { CollectionDefinition, FieldDefinition, JsonValue, Spec } from "@jthum/framework/spec";
import { stringify, parse } from "yaml";
import { blocks } from "$lib/runtime/blocks.ts";
import { appTemplates } from "./templates/index.ts";

export interface ToolSource {
  getTools(mode: WebMcpAppToolMode): ToolDefinition[];
  subscribe(listener: () => void): () => void;
}
export interface ToolContext {
  runtime(): AppRuntime;
  spec(): Spec;
  changed(): Promise<void>;
  createApp(name: string, template?: string): Promise<void>;
  selectApp(id: string): Promise<void>;
  deleteApp(id: string): Promise<void>;
  createSpace(name: string): Promise<void>;
}
export interface BuildToolsOptions {
  appTools?: WebMcpAppToolMode;
}

function object(
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}
const string = { type: "string" };
const valuesSchema = { type: "object", additionalProperties: true };
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new FrameworkError({
      code: ERROR_CODES.validationInvalidInput,
      message: "A non-empty string is required.",
    });
  return value;
}
function values(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FrameworkError({
      code: ERROR_CODES.validationInvalidInput,
      message: "Values must be an object.",
    });
  return value as Record<string, JsonValue>;
}
function fieldSchema(field: FieldDefinition): Record<string, unknown> {
  let schema: Record<string, unknown>;
  if (field.type === "number")
    schema = {
      type: field.validation?.integer ? "integer" : "number",
      ...(field.validation?.min !== undefined ? { minimum: field.validation.min } : {}),
      ...(field.validation?.max !== undefined ? { maximum: field.validation.max } : {}),
    };
  else if (field.type === "boolean") schema = { type: "boolean" };
  else if (field.type === "json") schema = {};
  else if (field.type === "choice")
    schema = { type: "string", enum: field.options.map((option) => option.key) };
  else schema = { type: "string" };
  if ((field.type === "reference" || field.type === "choice") && field.multiple)
    schema = { type: "array", items: schema };
  if (field.type === "text") {
    if (field.format === "email") schema.format = "email";
    if (field.format === "url") schema.format = "uri";
    Object.assign(schema, field.validation);
    delete schema.message;
  }
  return { ...schema, description: field.description ?? field.label };
}

export function buildTools(
  context: ToolContext,
  options: BuildToolsOptions = {},
): ToolDefinition[] {
  const tool = (
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    execute: ToolDefinition["execute"],
    readOnly = false,
    surface: ToolSurface = "builder",
  ): ToolDefinition => ({
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint: readOnly },
    surface,
    execute: async (input) => {
      const result = await execute(input);
      if (!readOnly) await context.changed();
      return result;
    },
  });
  const runtime = () => context.runtime();
  const client = () => runtime().appClient;
  const tools: ToolDefinition[] = [
    tool(
      "get_space",
      "Inspect the current Space, App, locally issued Actors, and shared Collections.",
      object(),
      async () => {
        const current = runtime();
        return {
          space: await current.spaceClient.getWorkspace(),
          app: await client().getWorkspace(),
          actors: await current.kernel.listActorsByOrigin(current.spaceContext, current.space.id),
          apps: await current.kernel.listChildWorkspaces(current.spaceContext, current.space.id),
        };
      },
      true,
    ),
    tool(
      "get_spec",
      "Read the canonical portable App Spec. Records and Attachments are not Spec data.",
      object(),
      async () => (await client().getWorkspace()).spec,
      true,
    ),
    tool(
      "get_blocks",
      "List official Blocks and their configurable inputs.",
      object(),
      () => blocks,
      true,
    ),
    tool(
      "get_automation_primitives",
      "Inspect installed Action/Condition keys and workflow runtime capabilities.",
      object(),
      () => {
        const kernel = runtime().kernel;
        const short = kernel.getRuleRuntimeProfile(
          new Set([
            "record.created",
            "record.updated",
            "record.deleted",
            "record.field_changed",
            "form.submitted",
          ]),
        );
        const profile = kernel.environment.durableRuleExecution
          ? { ...kernel.getDurableRuleRuntimeProfile(), events: short.events }
          : short;
        return {
          actions: [...profile.actions],
          conditions: [...profile.conditions],
          profile: {
            ...profile,
            actions: [...profile.actions],
            conditions: [...profile.conditions],
            events: [...profile.events],
          },
        };
      },
      true,
    ),
    tool(
      "export_spec",
      "Export the portable App Spec without records or Workspace instance data.",
      object({ format: { enum: ["json", "yaml"] } }),
      async ({ format }) => {
        const spec = (await client().getWorkspace()).spec;
        return {
          format: format === "yaml" ? "yaml" : "json",
          spec: format === "yaml" ? stringify(spec) : JSON.stringify(spec, null, 2),
        };
      },
      true,
    ),
    tool(
      "apply_spec",
      "Replace the App Spec with canonical JSON or YAML. Kernel validation is authoritative.",
      object({ spec: { description: "Canonical Spec object, JSON text, or YAML text." } }, [
        "spec",
      ]),
      async (input) =>
        client().applySpec(
          (typeof input.spec === "string" ? parse(input.spec) : input.spec) as Spec,
        ),
    ),
    tool(
      "query_view",
      "Query a canonical View using exposed parameter values.",
      object({ key: string, parameters: valuesSchema }, ["key"]),
      ({ key, parameters }) =>
        client().queryView(text(key), { parameters: parameters ? values(parameters) : undefined }),
      true,
      "app",
    ),
    tool(
      "submit_form",
      "Submit a canonical record or custom Form, including its form.submitted Rules.",
      object({ key: string, values: valuesSchema, recordId: string }, ["key", "values"]),
      ({ key, values: input, recordId }) =>
        client().submitForm(text(key), {
          values: values(input),
          ...(recordId ? { recordId: text(recordId) } : {}),
        }),
      false,
      "app",
    ),
    tool(
      "create_app",
      "Create and select an App, optionally from an official template.",
      object({ name: string, template: string }, ["name"]),
      ({ name, template }) => context.createApp(text(name), template ? text(template) : undefined),
    ),
    tool(
      "switch_app",
      "Select an App using its canonical Workspace ID.",
      object({ id: string }, ["id"]),
      ({ id }) => context.selectApp(text(id)),
    ),
    tool(
      "delete_app",
      "Delete an App and its local records. At least one App must remain.",
      object({ id: string }, ["id"]),
      ({ id }) => context.deleteApp(text(id)),
    ),
    tool(
      "create_space",
      "Create and select an independent local Space with its own Actor issuance and Apps.",
      object({ name: string }, ["name"]),
      ({ name }) => context.createSpace(text(name)),
    ),
    tool(
      "list_templates",
      "List official App templates.",
      object(),
      () =>
        appTemplates.map(({ key, label, description, category }) => ({
          key,
          label,
          description,
          category,
        })),
      true,
    ),
    tool(
      "describe_collection",
      "Inspect a local Collection or attached Source schema.",
      object({ collection: string }, ["collection"]),
      ({ collection }) => client().getSource(text(collection)),
      true,
      "app",
    ),
  ];
  for (const [kind, key] of [
    ["collection", "collections"],
    ["view", "views"],
    ["form", "forms"],
    ["rule", "rules"],
    ["page", "pages"],
  ] as const) {
    tools.push(
      tool(
        `upsert_${kind}`,
        `Create or replace a canonical ${kind} definition. Supply its stable id, key, label and complete definition; get_spec shows the current format. A Collection with shared: true is installed in the Space and attached to this App.`,
        object({ definition: valuesSchema, shared: { type: "boolean" } }, ["definition"]),
        async ({ definition, shared }) => {
          const current = runtime();
          const isShared = kind === "collection" && shared === true;
          const target = isShared ? current.spaceClient : current.appClient;
          const workspace = await target.getWorkspace();
          const item = values(definition);
          const id = text(item.id);
          const existing = workspace.spec[key];
          const updated = await target.applySpec({
            ...workspace.spec,
            [key]: [
              ...existing.filter((candidate) => candidate.id !== id && candidate.key !== item.key),
              item,
            ],
          } as Spec);
          if (!isShared) return updated;

          const app = await current.appClient.getWorkspace();
          const source = { id, key: text(item.key), label: text(item.label) };
          const previous = app.spec;
          const next = {
            ...previous,
            sources: [
              ...previous.sources.filter(
                (candidate) => candidate.id !== id && candidate.key !== source.key,
              ),
              source,
            ],
          };
          try {
            await current.appClient.applySpec(next);
            const attached = (await current.kernel.listAttachmentsTo(current.appContext)).some(
              (binding) => !binding.revokedAt && binding.sourceId === id,
            );
            if (!attached)
              await current.kernel.createAttachment(current.spaceContext, {
                collectionKey: source.key,
                targetId: current.app.id,
                sourceId: id,
              });
          } catch (error) {
            try {
              await current.appClient.applySpec(previous);
            } catch (cleanupError) {
              throw new AggregateError(
                [error, cleanupError],
                "Shared Collection attachment and cleanup failed.",
              );
            }
            throw error;
          }
          return {
            collection: updated.spec.collections.find((candidate) => candidate.id === id),
            source,
          };
        },
      ),
    );
  }

  const operations: Record<string, (input: Record<string, unknown>) => unknown> = {
    list: ({ collection }) => client().querySource(text(collection)),
    get: ({ collection, id }) => client().getSourceRecord(text(collection), text(id)),
    create: async ({ collection, values: input }) =>
      (await writeClient(text(collection))).createRecord(text(collection), values(input)),
    update: async ({ collection, id, values: input }) =>
      (await writeClient(text(collection))).updateRecord(text(collection), text(id), values(input)),
    delete: async ({ collection, id }) =>
      (await writeClient(text(collection))).deleteRecord(text(collection), text(id)),
    transition: async ({ collection, id, transition }) => {
      const current = runtime();
      const target = await writeClient(text(collection), current, context.spec());
      const source = await current.appClient.getSource(text(collection));
      const lifecycle = source?.schema.lifecycle;
      const move = lifecycle?.transitions.find((candidate) => candidate.key === text(transition));
      const field = source?.schema.fields.find((candidate) => candidate.id === lifecycle?.fieldId);
      if (!move || !field) throw new Error("Lifecycle transition is unavailable.");
      return target.updateRecord(text(collection), text(id), {
        [field.key]: move.to,
      });
    },
  };
  async function writeClient(key: string, current = runtime(), spec = context.spec()) {
    const source = spec.sources.find((source) => source.key === key);
    const space = source ? await current.spaceClient.getWorkspace() : undefined;
    const shared =
      source && space?.spec.collections.some((collection) => collection.id === source.id);
    return shared ? current.spaceClient : current.appClient;
  }
  const operationSchema = (operation: string) =>
    object(
      {
        collection: string,
        ...(operation !== "list" && operation !== "create" ? { id: string } : {}),
        ...(operation === "create" || operation === "update" ? { values: valuesSchema } : {}),
        ...(operation === "transition" ? { transition: string } : {}),
      },
      [
        "collection",
        ...(operation !== "list" && operation !== "create" ? ["id"] : []),
        ...(operation === "create" || operation === "update" ? ["values"] : []),
        ...(operation === "transition" ? ["transition"] : []),
      ],
    );
  for (const [operation, execute] of Object.entries(operations))
    tools.push(
      tool(
        operation === "list" ? "list_records" : `${operation}_record`,
        `${operation} records using the canonical Source/record operations.`,
        operationSchema(operation),
        execute,
        operation === "list" || operation === "get",
        "app",
      ),
    );
  if (options.appTools === "typed") {
    for (const collection of context.spec().collections) addTypedTools(collection);
  }
  function addTypedTools(collection: CollectionDefinition): void {
    for (const [operation, execute] of Object.entries(operations)) {
      const lifecycleField = collection.lifecycle?.fieldId;
      const fields = collection.fields.filter((field) => field.id !== lifecycleField);
      const properties = Object.fromEntries(fields.map((field) => [field.key, fieldSchema(field)]));
      const inputSchema =
        operation === "create" || operation === "update"
          ? object({ ...(operation === "update" ? { id: string } : {}), ...properties }, [
              ...(operation === "update" ? ["id"] : []),
              ...(operation === "create"
                ? fields
                    .filter((field) => field.required && field.default === undefined)
                    .map((field) => field.key)
                : []),
            ])
          : object(
              {
                ...(operation !== "list" ? { id: string } : {}),
                ...(operation === "transition"
                  ? {
                      transition: {
                        enum: collection.lifecycle?.transitions.map((move) => move.key) ?? [],
                      },
                    }
                  : {}),
              },
              [
                ...(operation !== "list" ? ["id"] : []),
                ...(operation === "transition" ? ["transition"] : []),
              ],
            );
      if (operation === "transition" && !collection.lifecycle) continue;
      tools.push(
        tool(
          `${operation}_${collection.key}`,
          `${operation} ${collection.label} records. Thin alias for generic record tools.`,
          inputSchema,
          (input) => {
            const { id, transition, ...recordValues } = input;
            return execute({ collection: collection.key, id, transition, values: recordValues });
          },
          operation === "list" || operation === "get",
          "app",
        ),
      );
    }
  }
  for (const rule of context
    .spec()
    .rules.filter(
      (rule) => !rule.trigger && rule.expose?.includes("agent") && rule.enabled !== false,
    )) {
    const properties = Object.fromEntries(
      Object.entries(rule.input ?? {}).map(([key, definition]) => [
        key,
        "sourceId" in definition
          ? { type: "string", description: "Record ID" }
          : {
              type:
                definition.value === "text" || definition.value === "date"
                  ? "string"
                  : definition.value,
            },
      ]),
    );
    tools.push(
      tool(
        `invoke_${rule.key}`,
        `Run ${rule.label} with its declared workflow inputs.`,
        object(
          properties,
          Object.entries(rule.input ?? {})
            .filter(([, value]) => value.required)
            .map(([key]) => key),
        ),
        async (input) => {
          const result = await launchRule(client(), rule.key, {
            input: input as Record<string, JsonValue>,
          });
          return result.mode === "short"
            ? result.run
            : {
                ...result.execution,
                mode: "durable",
                runUrl: `/build/automations/runs?run=${encodeURIComponent(result.execution.id)}`,
              };
        },
        false,
        "app",
      ),
    );
  }
  return tools;
}

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
  return JSON.stringify(value ?? { ok: true });
}

export function createWebMcpBridge(
  source: ToolSource,
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
  const currentTools = () => source.getTools(appToolMode);

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
            error:
              error instanceof FrameworkError
                ? error.toEnvelope()
                : {
                    code: ERROR_CODES.internalUnexpected,
                    message: "An unexpected error occurred.",
                  },
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

  const unsubscribe = source.subscribe(() => {
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
