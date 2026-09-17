import {
  assertValidSpec,
  type FieldCondition,
  type FieldDefinition,
  type FormDefinition,
  type JsonValue,
  type PageLayoutNode,
  type SourceFilter,
  type Spec,
  type SpecMeta,
} from "@jthum/framework/spec";
import { inValues, normalizeFilters } from "$lib/runtime/filters.ts";
import { labelFromKey, slugify } from "$lib/runtime/ids.ts";
import type {
  AppSpec,
  FieldCondition as BuilderCondition,
  FieldDef,
  FilterClause,
  PageBlock,
  TypeDef,
} from "$lib/runtime/model.ts";

export interface FrameworkProjectionGap {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface FrameworkProjectionOptions {
  /** Types exposed by the parent Space. They become bound Sources, not copied Collections. */
  readonly sharedTypes?: readonly TypeDef[];
}

export interface FrameworkProjection {
  readonly spec: Spec;
  readonly gaps: readonly FrameworkProjectionGap[];
}

/**
 * Transitional Builder host boundary. It projects only semantics represented by the Framework;
 * gaps are explicit so the host never silently loses behavior.
 */
export function projectFrameworkSpec(
  input: AppSpec,
  options: FrameworkProjectionOptions,
): FrameworkProjection {
  const gaps: FrameworkProjectionGap[] = [];
  const sharedIds = new Set((options.sharedTypes ?? []).map((type) => type.id));
  const localTypes = input.types.filter((type) => !sharedIds.has(type.id));
  const sharedTypes = options.sharedTypes ?? [];
  const sources = new Map([
    ...localTypes.map((type) => [type.key, type.id] as const),
    ...sharedTypes.map((type) => [type.key, type.id] as const),
  ]);
  const allTypes = new Map([...localTypes, ...sharedTypes].map((type) => [type.key, type]));
  const collections = localTypes.map((type, index) =>
    projectCollection(type, `types.${index}`, allTypes, sources),
  );
  const forms = input.forms.flatMap<FormDefinition>((form, index): FormDefinition[] => {
    const path = `forms.${index}`;
    if (form.mode === "standalone") {
      return [
        {
          id: form.id,
          key: form.key,
          label: form.label,
          ...(form.meta ? { meta: form.meta } : {}),
          mode: "standalone" as const,
          fields: (form.inputs ?? []).map((field, fieldIndex) =>
            projectField(
              field,
              `${path}.inputs.${fieldIndex}`,
              allTypes,
              sources,
              form.inputs ?? [],
            ),
          ),
          ...(form.submit ? { submit: form.submit } : {}),
        },
      ];
    }
    const type = form.type ? allTypes.get(form.type) : undefined;
    if (!type) {
      gaps.push({
        path: `${path}.type`,
        code: "FORM.COLLECTION_UNRESOLVED",
        message: "The record Form does not resolve to a Type.",
      });
      return [];
    }
    if (sharedIds.has(type.id)) {
      gaps.push({
        path,
        code: "FORM.ATTACHED_WRITE_UNSUPPORTED",
        message: "Writes through attached Sources are not implemented by the Framework yet.",
      });
      return [];
    }
    const fields = new Map(type.fields.map((field) => [field.key, field.id]));
    return [
      {
        id: form.id,
        key: form.key,
        label: form.label,
        ...(form.meta ? { meta: form.meta } : {}),
        mode: form.mode,
        collectionId: type.id,
        fieldIds: (form.fields ?? []).flatMap((key) => {
          const id = fields.get(key);
          if (id) return [id];
          gaps.push({
            path: `${path}.fields`,
            code: "FORM.FIELD_UNRESOLVED",
            message: `Field ${key} is not declared by ${type.label}.`,
          });
          return [];
        }),
      },
    ];
  });
  const views = input.views.flatMap((view, index) => {
    const path = `views.${index}`;
    const type = allTypes.get(view.source);
    if (!type) {
      gaps.push({
        path: `${path}.source`,
        code: "VIEW.SOURCE_UNRESOLVED",
        message: "The View source does not resolve to a Type.",
      });
      return [];
    }
    if (view.group_by || view.measures) {
      gaps.push({
        path,
        code: "VIEW.AGGREGATION_UNSUPPORTED",
        message: "Grouped and aggregate Views wait for Source aggregation capabilities.",
      });
      return [];
    }
    const select = view.fields.flatMap((field, fieldIndex) => {
      const fieldPath = resolveFieldPath(type, field, allTypes);
      if (!fieldPath) {
        gaps.push({
          path: `${path}.fields.${fieldIndex}`,
          code: "VIEW.FIELD_UNRESOLVED",
          message: `View path ${field} cannot be resolved.`,
        });
        return [];
      }
      return [
        { path: fieldPath, as: slugify(field.replaceAll(".", "_")) || `field_${fieldIndex}` },
      ];
    });
    const filters = normalizeFilters(view.where).flatMap((filter, filterIndex) => {
      const projected = projectSourceFilter(type, filter, allTypes);
      if (projected) return [projected];
      gaps.push({
        path: `${path}.where.${filterIndex}`,
        code: "VIEW.FILTER_UNRESOLVED",
        message: `Filter path ${filter.field} cannot be projected.`,
      });
      return [];
    });
    const sort = Object.entries(view.order_by ?? {}).flatMap(([field, direction]) => {
      const fieldPath = resolveFieldPath(type, field, allTypes);
      if (fieldPath) return [{ path: fieldPath, direction }];
      gaps.push({
        path: `${path}.order_by.${field}`,
        code: "VIEW.SORT_UNRESOLVED",
        message: `Sort path ${field} cannot be projected.`,
      });
      return [];
    });
    return [
      {
        id: view.id,
        key: view.key,
        label: view.label,
        ...(view.meta ? { meta: view.meta } : {}),
        source: view.source,
        query: {
          ...(filters.length === 1
            ? { filter: filters[0] }
            : filters.length
              ? { filter: { all: filters } }
              : {}),
          ...(sort.length ? { sort } : {}),
          ...(select.length ? { select } : {}),
          ...(view.limit ? { limit: view.limit } : {}),
        },
      },
    ];
  });
  if (input.workflows.length) {
    gaps.push({
      path: "workflows",
      code: "RULES.NOT_PROJECTED",
      message: "Builder workflows move when the Framework Rule primitive lands in Phase 5.",
    });
  }
  const spec: Spec = {
    version: 2,
    id: input.id,
    key: input.key,
    label: input.label,
    ...(input.meta ? { meta: input.meta } : {}),
    collections,
    sources: sharedTypes.map((type) => ({
      id: type.id,
      key: type.key,
      label: type.label,
      ...(type.meta ? { meta: type.meta } : {}),
    })),
    views,
    forms,
    pages: input.pages.map((page) => ({
      id: page.id,
      key: page.key,
      label: page.label,
      meta: pageMeta(page.meta, page.icon, page.folder, page.path),
      layout: page.blocks.map((block, index) => projectPageNode(block, [index])),
    })),
    rules: [],
  };
  assertValidSpec(spec);
  return { spec, gaps };
}

export function assertFrameworkProjectionReady(projection: FrameworkProjection): Spec {
  if (!projection.gaps.length) return projection.spec;
  throw new Error(
    projection.gaps.map((gap) => `${gap.code} at ${gap.path}: ${gap.message}`).join("\n"),
  );
}

function projectCollection(
  type: TypeDef,
  path: string,
  types: ReadonlyMap<string, TypeDef>,
  sources: ReadonlyMap<string, string>,
) {
  const fields = type.fields.map((field, index) =>
    projectField(field, `${path}.fields.${index}`, types, sources, type.fields),
  );
  const lifecycleField = type.lifecycle
    ? type.fields.find((field) => field.key === type.lifecycle?.field)
    : undefined;
  return {
    id: type.id,
    key: type.key,
    label: type.label,
    ...(type.meta ? { meta: type.meta } : {}),
    fields,
    ...(type.lifecycle && lifecycleField
      ? {
          lifecycle: {
            fieldId: lifecycleField.id,
            initial: type.lifecycle.initial,
            ...(type.lifecycle.terminal ? { terminal: type.lifecycle.terminal } : {}),
            transitions: type.lifecycle.transitions.map((transition) => ({
              ...transition,
              id: requireDefinitionId(transition.id, `${path}.lifecycle.transitions`),
            })),
          },
        }
      : {}),
  };
}

function projectField(
  field: FieldDef,
  path: string,
  types: ReadonlyMap<string, TypeDef>,
  sources: ReadonlyMap<string, string>,
  siblings: readonly FieldDef[],
): FieldDefinition {
  const base = {
    id: field.id,
    key: field.key,
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    ...(field.required ? { required: true } : {}),
    ...(field.default !== undefined
      ? { default: jsonValue(field.default, `${path}.default`) }
      : {}),
    ...fieldMetadata(field),
    ...fieldBehavior(field, siblings),
  };
  if (field.type === "enum")
    return {
      ...base,
      type: "choice",
      options: (field.values ?? []).map((value) => ({
        id: `${field.id}:${value}`,
        key: slugify(value),
        label: labelFromKey(value),
      })),
    };
  if (field.type === "reference") {
    const target = field.target?.split(".").at(-1) ?? "";
    const sourceId = sources.get(target);
    if (!sourceId || !types.has(target))
      throw new Error(`Unresolved reference target ${field.target ?? ""} at ${path}`);
    return { ...base, type: "reference", sourceId };
  }
  if (field.type === "text")
    return {
      ...base,
      type: "text",
      ...(field.format && ["email", "url", "phone"].includes(field.format)
        ? { format: field.format as "email" | "url" | "phone" }
        : {}),
      ...(field.validation
        ? {
            validation: {
              ...(field.validation.min_length !== undefined
                ? { minLength: field.validation.min_length }
                : {}),
              ...(field.validation.max_length !== undefined
                ? { maxLength: field.validation.max_length }
                : {}),
              ...(field.validation.pattern ? { pattern: field.validation.pattern } : {}),
              ...(field.validation.message ? { message: field.validation.message } : {}),
            },
          }
        : {}),
    };
  if (field.type === "number")
    return {
      ...base,
      type: "number",
      ...(field.format === "currency" || field.format === "percentage"
        ? { format: field.format }
        : {}),
      ...(field.currency ? { currency: field.currency } : {}),
      ...(field.validation
        ? {
            validation: {
              ...(field.validation.min !== undefined ? { min: field.validation.min } : {}),
              ...(field.validation.max !== undefined ? { max: field.validation.max } : {}),
              ...(field.validation.message ? { message: field.validation.message } : {}),
            },
          }
        : {}),
    };
  return { ...base, type: field.type };
}

function fieldMetadata(field: FieldDef): { meta?: SpecMeta } {
  const presentation = {
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.presentation ? { presentation: field.presentation } : {}),
    ...(field.variant ? { variant: field.variant } : {}),
    ...(field.max !== undefined ? { ratingMax: field.max } : {}),
    ...(field.value_semantics ? { valueSemantics: field.value_semantics } : {}),
  };
  const meta = {
    ...field.meta,
    ...(Object.keys(presentation).length ? { presentation } : {}),
  };
  return Object.keys(meta).length ? { meta: meta as SpecMeta } : {};
}

function fieldBehavior(field: FieldDef, siblings: readonly FieldDef[]) {
  const byKey = new Map(siblings.map((item) => [item.key, item.id]));
  const behavior = {
    ...(field.visible_when ? { visibleWhen: projectCondition(field.visible_when, byKey) } : {}),
    ...(field.enabled_when ? { enabledWhen: projectCondition(field.enabled_when, byKey) } : {}),
    ...(field.required_when ? { requiredWhen: projectCondition(field.required_when, byKey) } : {}),
    ...(field.hidden_value ? { hiddenValue: field.hidden_value } : {}),
  };
  return Object.keys(behavior).length ? { behavior } : {};
}

function projectCondition(
  condition: BuilderCondition,
  fields: ReadonlyMap<string, string>,
): FieldCondition {
  if ("all" in condition)
    return { all: condition.all.map((item) => projectCondition(item, fields)) };
  if ("any" in condition)
    return { any: condition.any.map((item) => projectCondition(item, fields)) };
  if ("not" in condition) return { not: projectCondition(condition.not, fields) };
  const fieldId = fields.get(condition.field);
  if (!fieldId) throw new Error(`Unresolved conditional Field ${condition.field}`);
  if (condition.op === "in")
    return {
      any: inValues(condition.value).map((value) => ({
        fieldId,
        operator: "eq",
        value: jsonValue(value, "condition.value"),
      })),
    };
  return {
    fieldId,
    operator: operator(condition.op),
    ...(condition.value === undefined
      ? {}
      : { value: jsonValue(condition.value, "condition.value") }),
  };
}

function projectSourceFilter(
  type: TypeDef,
  clause: FilterClause,
  types: ReadonlyMap<string, TypeDef>,
): SourceFilter | undefined {
  const path = resolveFieldPath(type, clause.field, types);
  if (!path) return undefined;
  if (clause.op === "in")
    return {
      any: inValues(clause.value).map((value) => ({
        path,
        operator: "eq",
        value: jsonValue(value, "filter.value"),
      })),
    };
  return {
    path,
    operator: operator(clause.op),
    ...(clause.value === undefined ? {} : { value: jsonValue(clause.value, "filter.value") }),
  };
}

function operator(
  value: FilterClause["op"],
): "eq" | "neq" | "contains" | "empty" | "notEmpty" | "gt" | "gte" | "lt" | "lte" {
  return value === "not_empty" ? "notEmpty" : value === "in" || value === undefined ? "eq" : value;
}

function resolveFieldPath(
  root: TypeDef,
  path: string,
  types: ReadonlyMap<string, TypeDef>,
): string[] | undefined {
  let type: TypeDef | undefined = root;
  const ids: string[] = [];
  for (const [index, key] of path.split(".").entries()) {
    const field: FieldDef | undefined = type?.fields.find((candidate) => candidate.key === key);
    if (!field) return undefined;
    ids.push(field.id);
    if (index < path.split(".").length - 1) {
      if (field.type !== "reference") return undefined;
      type = types.get(field.target?.split(".").at(-1) ?? "");
    }
  }
  return ids;
}

function projectPageNode(block: PageBlock, path: readonly number[]): PageLayoutNode {
  const id = requireDefinitionId(block.id, `pages.layout.${path.join(".")}`);
  if (block.kind === "widget")
    return {
      id,
      kind: "block",
      block: block.widget,
      ...(block.values
        ? { config: jsonObject(block.values, `pages.layout.${path.join(".")}`) }
        : {}),
    };
  return {
    id,
    kind: "group",
    ...(block.columns ? { columns: block.columns } : {}),
    ...(block.min_height ? { minHeight: block.min_height } : {}),
    children: block.blocks.map((child, index) => projectPageNode(child, [...path, index])),
  };
}

function requireDefinitionId(id: string | undefined, path: string): string {
  if (id) return id;
  throw new Error(`Missing stable definition ID at ${path}.`);
}

function pageMeta(
  meta: SpecMeta | undefined,
  icon?: string,
  folder?: string,
  path?: string,
): SpecMeta | undefined {
  const value = {
    ...meta,
    ...(icon ? { icon } : {}),
    ...(folder ? { folder } : {}),
    ...(path ? { path } : {}),
  };
  return Object.keys(value).length ? value : undefined;
}

function jsonObject(value: Record<string, unknown>, path: string): SpecMeta {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, jsonValue(item, `${path}.${key}`)]),
  );
}

function jsonValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${path}.${index}`));
  if (value && typeof value === "object") return jsonObject(value as Record<string, unknown>, path);
  throw new Error(`${path} is not JSON-compatible.`);
}
