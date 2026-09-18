import type {
  ContextualInferenceTool,
  InferenceToolInputSchema,
  InferenceToolProvider,
  InferenceToolValueSchema,
} from "@jthum/framework/kernel";
import type { FieldDefinition, JsonValue } from "@jthum/framework/spec";
import { nanoid } from "nanoid";
import { buildTools, toolSurface, type ToolContext, type ToolDefinition } from "$lib/app/webmcp.ts";

/** Projects Builder.run's canonical authoring tools into Framework inference. */
export function createAuthoringInferenceTools(context: ToolContext): InferenceToolProvider {
  return {
    resolve: () =>
      buildTools(context)
        .filter((tool) => toolSurface(tool) === "builder" && !APP_LIFECYCLE_TOOLS.has(tool.name))
        .map((tool) => projectTool(tool, context)),
  };
}

const APP_LIFECYCLE_TOOLS = new Set(["create_app", "switch_app", "delete_app", "create_space"]);

function projectTool(tool: ToolDefinition, context: ToolContext): ContextualInferenceTool {
  const eager = tool.name === "get_space" || tool.name === "get_spec";
  return {
    id: `builder:${tool.name}`,
    label: tool.title ?? readableName(tool.name),
    description: tool.description,
    input:
      tool.name === "upsert_collection"
        ? COLLECTION_AUTHORING_INPUT
        : inputSchema(tool.inputSchema),
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
    key: { type: "string", description: "Stable machine-readable field key." },
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
  },
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
        key: { type: "string", description: "Stable singular machine-readable key." },
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
      },
      required: ["key", "label", "fields"],
      additionalProperties: false,
    },
    shared: {
      type: "boolean",
      description: "True installs the Collection in the Space; false keeps it local to this App.",
    },
  },
  required: ["definition"],
  additionalProperties: false,
};

function normalizeAuthoringInput(
  toolName: string,
  input: Readonly<Record<string, JsonValue>>,
  context: ToolContext,
): Readonly<Record<string, unknown>> {
  if (toolName !== "upsert_collection") return input;
  const definition = record(input.definition);
  if (!definition) return input;
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
      id: existing?.id ?? nanoid(),
      ...(fields === undefined ? {} : { fields: fields.values }),
      ...(typeof definition.titleFieldId === "string"
        ? { titleFieldId: fields?.resolveId(definition.titleFieldId) ?? definition.titleFieldId }
        : {}),
      ...(lifecycle === undefined ? {} : { lifecycle }),
    },
  };
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
  const values = Array.isArray(value) ? value : legacyArrayShape(value);
  if (!values) return undefined;
  const normalized = values.map((value) => {
    const field = record(value) ?? {};
    const previous = existing.find(
      (candidate) => candidate.id === field.id || candidate.key === field.key,
    );
    return {
      ...field,
      id: previous?.id ?? nanoid(),
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
    return { ...option, id: previous?.id ?? nanoid() };
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
            return { ...transition, id: previous?.id ?? nanoid() };
          }),
        }
      : {}),
  };
}

function legacyArrayShape(value: unknown): readonly unknown[] | undefined {
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
