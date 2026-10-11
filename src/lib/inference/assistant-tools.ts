import type {
  ContextualInferenceTool,
  InferenceToolInputSchema,
  InferenceToolProvider,
  InferenceToolValueSchema,
} from "@jthum/framework/kernel";
import type {
  CollectionDefinition,
  FieldDefinition,
  FormDefinition,
  JsonValue,
  PageDefinition,
  RuleDefinition,
  ViewDefinition,
} from "@jthum/framework/spec";
import { createSpecId } from "$lib/runtime/ids.ts";
import { invalidInput } from "@jthum/framework/errors";
import {
  buildTools,
  getWebMcpAppToolMode,
  type ToolContext,
  type ToolDefinition,
} from "$lib/app/webmcp.ts";

/** Projects the complete WebMCP surface into Framework inference. */
export function createAssistantTools(context: ToolContext): InferenceToolProvider {
  return {
    resolve: (caller) => {
      const runtime = context.runtime();
      const active = runtime.appContext;
      // The personal Assistant runs in the Space so its own App switches/deletes can finish.
      // All actual operations still use the selected App's authorized Workspace client.
      const assistantInSpace =
        caller.metadata?.surface === "assistant" &&
        caller.execution.workspaceId === runtime.spaceContext?.workspaceId;
      if (
        (!assistantInSpace && caller.execution.workspaceId !== active.workspaceId) ||
        caller.execution.actorId !== active.actorId
      )
        return [];
      return buildTools(context, { appTools: getWebMcpAppToolMode() }).map((tool) =>
        projectTool(tool, context),
      );
    },
  };
}

// Keep model-facing property lists complete as the canonical definition types evolve.
type DefinitionKeys<T> = T extends unknown ? keyof T : never;
type DefinitionProperties<T> = Readonly<Record<DefinitionKeys<T>, InferenceToolValueSchema>>;

function projectTool(tool: ToolDefinition, context: ToolContext): ContextualInferenceTool {
  const eager = tool.name === "get_space" || tool.name === "get_spec";
  return {
    id: `builder:${tool.name}`,
    name: tool.name,
    label: tool.title ?? readableName(tool.name),
    description: tool.description,
    input: AUTHORING_INPUTS[tool.name] ?? inputSchema(tool.inputSchema),
    availability: eager ? "eager" : "discoverable",
    keywords: [tool.name, tool.description],
    execute: async (input) =>
      jsonValue(await tool.execute(normalizeAuthoringInput(tool.name, input, context))),
  };
}

const FIELD_AUTHORING_SCHEMA: InferenceToolInputSchema = {
  type: "object",
  description:
    "A canonical field definition. Omit id when creating a field; it is generated safely.",
  properties: {
    id: { type: "string", description: "Existing stable field ID when updating a field." },
    key: { type: "string", description: "Machine-readable field key; identity comes from id." },
    label: { type: "string", description: "Human-readable field label." },
    description: { type: "string" },
    type: {
      type: "string",
      enum: ["text", "number", "boolean", "date", "datetime", "choice", "reference", "json"],
    },
    required: { type: "boolean" },
    multiple: { type: "boolean" },
    format: { type: "string" },
    currency: { type: "string" },
    sourceId: { type: "string", description: "Stable Source ID for a reference field." },
    default: { type: "json" },
    validation: { type: "json" },
    behavior: { type: "json" },
    meta: { type: "json" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          key: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          meta: { type: "json" },
        },
        required: ["key", "label"],
        additionalProperties: false,
      },
    },
  } satisfies DefinitionProperties<FieldDefinition>,
  required: ["key", "label", "type"],
  additionalProperties: false,
};

const COLLECTION_AUTHORING_INPUT: InferenceToolInputSchema = {
  type: "object",
  properties: {
    definition: {
      type: "object",
      description:
        "A complete canonical Collection definition. Omit new IDs; preserve IDs from get_spec when updating.",
      properties: {
        id: { type: "string", description: "Existing stable Collection ID when updating." },
        key: {
          type: "string",
          description: "Singular machine-readable key; identity comes from id.",
        },
        label: { type: "string", description: "Human-readable singular label." },
        collectionLabel: { type: "string", description: "Optional plural label." },
        description: { type: "string" },
        fields: { type: "array", items: FIELD_AUTHORING_SCHEMA },
        titleFieldId: { type: "string" },
        lifecycle: {
          type: "object",
          properties: {
            fieldId: {
              type: "string",
              description: "Existing field ID, or the key of a field being created in this call.",
            },
            initial: { type: "string" },
            terminal: { type: "array", items: { type: "string" } },
            transitions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  key: { type: "string" },
                  label: { type: "string" },
                  description: { type: "string" },
                  from: { type: "array", items: { type: "string" } },
                  to: { type: "string" },
                  meta: { type: "json" },
                },
                required: ["key", "label", "from", "to"],
                additionalProperties: false,
              },
            },
          },
          required: ["fieldId", "initial", "transitions"],
          additionalProperties: false,
        },
        meta: { type: "json" },
      } satisfies DefinitionProperties<CollectionDefinition>,
      required: ["key", "label", "fields"],
      additionalProperties: false,
    },
    shared: {
      type: "boolean",
      description:
        "False keeps it local to this App and is the default. Use true only when the user explicitly requests sharing across Apps in the Space.",
    },
  },
  required: ["definition"],
  additionalProperties: false,
};

const IDENTITY_PROPERTIES = {
  id: { type: "string", description: "Existing stable definition ID when updating." },
  key: { type: "string", description: "Machine-readable key; identity comes from id." },
  label: { type: "string", description: "Human-readable label." },
  description: { type: "string" },
  meta: { type: "json" },
} as const satisfies Record<string, InferenceToolValueSchema>;

const VIEW_AUTHORING_INPUT: InferenceToolInputSchema = definitionInput<ViewDefinition>(
  {
    ...IDENTITY_PROPERTIES,
    source: { type: "string", description: "Collection key or attached Source key." },
    query: { type: "json", description: "Optional canonical Source query." },
    parameters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          path: { type: "array", items: { type: "string" } },
          operator: {
            type: "string",
            enum: ["eq", "neq", "contains", "empty", "notEmpty", "gt", "gte", "lt", "lte"],
          },
          required: { type: "boolean" },
          source: { type: "string", enum: ["input", "context"] },
        },
        required: ["key", "path"],
        additionalProperties: false,
      },
    },
    presentation: {
      type: "object",
      properties: { block: { type: "string" }, config: { type: "json" } },
      required: ["block"],
      additionalProperties: false,
    },
  },
  ["key", "label", "source"],
);

const FORM_AUTHORING_INPUT: InferenceToolInputSchema = definitionInput<FormDefinition>(
  {
    ...IDENTITY_PROPERTIES,
    mode: { type: "string", enum: ["create", "edit", "standalone"] },
    collectionId: {
      type: "string",
      description: "Stable Collection ID; required for create and edit forms.",
    },
    fieldIds: {
      type: "array",
      description: "Ordered stable field IDs; required for create and edit forms.",
      items: { type: "string" },
    },
    fields: {
      type: "array",
      description: "Form-owned fields; required for standalone forms.",
      items: FIELD_AUTHORING_SCHEMA,
    },
    submit: { type: "json" },
  },
  ["key", "label", "mode"],
);

const PAGE_AUTHORING_INPUT: InferenceToolInputSchema = definitionInput<PageDefinition>(
  {
    ...IDENTITY_PROPERTIES,
    layout: {
      type: "array",
      description:
        "Ordered canonical Page layout nodes. Each node is a block or a group with children.",
      items: { type: "json" },
    },
  },
  ["key", "label", "layout"],
);

const RULE_AUTHORING_INPUT: InferenceToolInputSchema = definitionInput<RuleDefinition>(
  {
    ...IDENTITY_PROPERTIES,
    enabled: { type: "boolean" },
    priority: { type: "number" },
    input: { type: "json" },
    trigger: { type: "json" },
    expose: { type: "array", items: { type: "string", enum: ["ui", "agent"] } },
    tool: {
      type: "object",
      description: "Optional model-facing name and description when exposed to agents.",
      properties: { name: { type: "string" }, description: { type: "string" } },
      additionalProperties: false,
    },
    steps: {
      type: "array",
      description:
        "Ordered canonical Rule steps. Use get_automation_primitives to check runtime capabilities.",
      items: { type: "json" },
    },
    result: {
      type: "json",
      description: "Optional canonical RuleValue returned to callers, including $ref bindings.",
    },
    output: {
      type: "json",
      description: "Optional RuleOutputContract asserting the resolved result's type and fields.",
    },
  },
  ["key", "label", "steps"],
);

const AUTHORING_INPUTS: Readonly<Record<string, InferenceToolInputSchema>> = {
  upsert_collection: COLLECTION_AUTHORING_INPUT,
  upsert_view: VIEW_AUTHORING_INPUT,
  upsert_form: FORM_AUTHORING_INPUT,
  upsert_rule: RULE_AUTHORING_INPUT,
  upsert_page: PAGE_AUTHORING_INPUT,
};

function definitionInput<T>(
  properties: DefinitionProperties<T>,
  required: readonly string[],
): InferenceToolInputSchema {
  return {
    type: "object",
    properties: {
      definition: {
        type: "object",
        description:
          "A complete canonical definition. Omit a new definition's ID; preserve it from get_spec when updating.",
        properties,
        required,
        additionalProperties: false,
      },
    },
    required: ["definition"],
    additionalProperties: false,
  };
}

function normalizeAuthoringInput(
  toolName: string,
  input: Readonly<Record<string, JsonValue>>,
  context: ToolContext,
): Readonly<Record<string, unknown>> {
  if (!toolName.startsWith("upsert_")) return input;
  const definition = record(input.definition);
  if (!definition) return input;
  const kind = toolName.slice("upsert_".length);
  const definitions = definitionList(context.spec(), kind);
  const existingDefinition = definitions.find(
    (candidate) => candidate.id === definition.id || candidate.key === definition.key,
  );
  const id = existingDefinition?.id ?? definitionId(definition.id);
  if (toolName !== "upsert_collection") {
    const existingForm =
      toolName === "upsert_form"
        ? context
            .spec()
            .forms.find(
              (candidate) => candidate.id === definition.id || candidate.key === definition.key,
            )
        : undefined;
    return {
      ...input,
      definition: {
        ...definition,
        id,
        ...(toolName === "upsert_form" && Array.isArray(definition.fields)
          ? {
              fields: normalizeFields(
                definition.fields,
                existingForm?.mode === "standalone" ? existingForm.fields : [],
              )?.values,
            }
          : {}),
        ...(toolName === "upsert_page" && Array.isArray(definition.layout)
          ? { layout: normalizeNodeIds(definition.layout) }
          : {}),
        ...(toolName === "upsert_rule" && Array.isArray(definition.steps)
          ? { steps: normalizeNodeIds(definition.steps) }
          : {}),
      },
    };
  }
  const collections = context.spec().collections;
  const existing = collections.find(
    (candidate) => candidate.id === definition.id || candidate.key === definition.key,
  );
  const fields = normalizeFields(definition.fields, existing?.fields ?? []);
  const lifecycle = normalizeLifecycle(definition.lifecycle, existing?.lifecycle, fields);
  return {
    ...input,
    definition: {
      ...definition,
      id,
      ...(fields === undefined ? {} : { fields: fields.values }),
      ...(typeof definition.titleFieldId === "string"
        ? { titleFieldId: fields?.resolveId(definition.titleFieldId) ?? definition.titleFieldId }
        : {}),
      ...(lifecycle === undefined ? {} : { lifecycle }),
    },
  };
}

function definitionList(
  spec: ReturnType<ToolContext["spec"]>,
  kind: string,
): readonly { readonly id: string; readonly key: string }[] {
  if (kind === "collection") return spec.collections;
  if (kind === "view") return spec.views;
  if (kind === "form") return spec.forms;
  if (kind === "rule") return spec.rules;
  if (kind === "page") return spec.pages;
  return [];
}

function definitionId(value: unknown): string {
  if (value == null) return createSpecId();
  if (typeof value !== "string" || !value.trim())
    throw invalidInput("Definition IDs must be non-empty strings.");
  return value;
}

function normalizeNodeIds(values: readonly unknown[]): readonly unknown[] {
  return values.map((value) => {
    const node = record(value);
    if (!node) return value;
    const nestedKeys = ["children", "steps", "pass", "fail", "onSignal", "onTimeout"];
    const normalized: Record<string, unknown> = { ...node, id: definitionId(node.id) };
    for (const key of nestedKeys) {
      if (Array.isArray(node[key])) normalized[key] = normalizeNodeIds(node[key]);
    }
    if (record(node.gate)) normalized.gate = normalizeNestedStepContainer(record(node.gate)!);
    if (record(node.foreach))
      normalized.foreach = normalizeNestedStepContainer(record(node.foreach)!);
    if (record(node.repeat)) normalized.repeat = normalizeNestedStepContainer(record(node.repeat)!);
    if (record(node.wait)) {
      const wait = normalizeNestedStepContainer(record(node.wait)!);
      const request = record(wait.request);
      normalized.wait = {
        ...wait,
        ...(request && Array.isArray(request.fields)
          ? { request: { ...request, fields: normalizeFields(request.fields, [])?.values } }
          : {}),
      };
    }
    if (record(node.parallel) && Array.isArray(record(node.parallel)!.branches)) {
      normalized.parallel = {
        ...record(node.parallel),
        branches: (record(node.parallel)!.branches as readonly unknown[]).map((branch) => {
          const item = record(branch) ?? {};
          return {
            ...item,
            id: definitionId(item.id),
            ...(Array.isArray(item.steps) ? { steps: normalizeNodeIds(item.steps) } : {}),
          };
        }),
      };
    }
    return normalized;
  });
}

function normalizeNestedStepContainer(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["children", "steps", "pass", "fail", "onSignal", "onTimeout"].includes(key) &&
      Array.isArray(item)
        ? normalizeNodeIds(item)
        : item,
    ]),
  );
}

function normalizeFields(
  value: unknown,
  existing: readonly FieldDefinition[],
):
  | {
      readonly values: readonly Record<string, unknown>[];
      readonly resolveId: (value: string) => string;
    }
  | undefined {
  const values = Array.isArray(value) ? value : wrappedArrayShape(value);
  if (!values) return undefined;
  const normalized = values.map((value) => {
    const field = record(value) ?? {};
    const previous = existing.find(
      (candidate) => candidate.id === field.id || candidate.key === field.key,
    );
    return {
      ...field,
      id: previous?.id ?? definitionId(field.id),
      ...(Array.isArray(field.options)
        ? { options: normalizeOptions(field.options, previous) }
        : {}),
      ...(field.required === "true"
        ? { required: true }
        : field.required === "false"
          ? { required: false }
          : {}),
    };
  });
  return {
    values: normalized,
    resolveId: (value) => {
      const index = values.findIndex((candidate) => {
        const field = record(candidate);
        return field?.id === value || field?.key === value;
      });
      return index < 0 ? value : String(normalized[index]?.id ?? value);
    },
  };
}

function normalizeOptions(
  values: readonly unknown[],
  field: FieldDefinition | undefined,
): readonly Record<string, unknown>[] {
  const existing = field?.type === "choice" ? field.options : [];
  return values.map((value) => {
    const option = record(value) ?? {};
    const previous = existing.find(
      (candidate) => candidate.id === option.id || candidate.key === option.key,
    );
    return { ...option, id: previous?.id ?? definitionId(option.id) };
  });
}

function normalizeLifecycle(
  value: unknown,
  existing:
    | { readonly transitions: readonly { readonly id: string; readonly key: string }[] }
    | undefined,
  fields: ReturnType<typeof normalizeFields>,
): Record<string, unknown> | undefined {
  const lifecycle = record(value);
  if (!lifecycle) return undefined;
  return {
    ...lifecycle,
    ...(typeof lifecycle.fieldId === "string"
      ? { fieldId: fields?.resolveId(lifecycle.fieldId) ?? lifecycle.fieldId }
      : {}),
    ...(Array.isArray(lifecycle.transitions)
      ? {
          transitions: lifecycle.transitions.map((value) => {
            const transition = record(value) ?? {};
            const previous = existing?.transitions.find(
              (candidate) => candidate.id === transition.id || candidate.key === transition.key,
            );
            return { ...transition, id: previous?.id ?? definitionId(transition.id) };
          }),
        }
      : {}),
  };
}

/** Repair a model's wrapped array argument; this is not an alternative persisted Spec format. */
function wrappedArrayShape(value: unknown): readonly unknown[] | undefined {
  const shape = record(value);
  if (!shape || !("item" in shape)) return undefined;
  return Array.isArray(shape.item) ? shape.item : [shape.item];
}

function inputSchema(schema: Record<string, unknown>): InferenceToolInputSchema {
  const properties = record(schema.properties);
  return {
    type: "object",
    ...(typeof schema.description === "string" ? { description: schema.description } : {}),
    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [key, valueSchema(value)]),
          ),
        }
      : {}),
    ...(Array.isArray(schema.required)
      ? { required: schema.required.filter((value): value is string => typeof value === "string") }
      : {}),
    additionalProperties: schema.additionalProperties === true,
  };
}

function valueSchema(value: unknown): InferenceToolValueSchema {
  const schema = record(value);
  if (!schema) return { type: "json" };
  const description =
    typeof schema.description === "string" ? { description: schema.description } : {};
  if (schema.type === "string") {
    const values = Array.isArray(schema.enum)
      ? schema.enum.filter((item): item is string => typeof item === "string")
      : undefined;
    return { type: "string", ...description, ...(values?.length ? { enum: values } : {}) };
  }
  if (schema.type === "number" || schema.type === "integer")
    return { type: "number", ...description };
  if (schema.type === "boolean") return { type: "boolean", ...description };
  if (schema.type === "array")
    return { type: "array", ...description, items: valueSchema(schema.items) };
  if (schema.type === "object") return { ...inputSchema(schema), ...description };
  return { type: "json", ...description };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function jsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function readableName(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
