import { createSpecId, isSpecId, labelFromKey, slugify } from "./ids.ts";
import { normalizeSpecMeta, type SpecMeta, type SpecNode } from "./spec-node.ts";
import type { AutomationDefinition, AutomationStep } from "./automation/model.ts";
import { assertValidAutomation } from "./automation/validate.ts";
import {
  FIELD_KINDS,
  fieldCapability,
  supportsFieldFormat,
  supportsFieldPresentation,
  type FieldFormat,
  type FieldKind,
  type FieldPresentation,
  type FieldPresentationVariant,
} from "./field-capabilities.ts";

export {
  FIELD_CAPABILITIES,
  FIELD_FORMATS,
  FIELD_KINDS,
  FIELD_PRESENTATIONS,
  fieldCapability,
  fieldWidgetFor,
} from "./field-capabilities.ts";
export type {
  FieldCapability,
  FieldConfiguration,
  FieldFormat,
  FieldInputWidget,
  FieldKind,
  FieldPresentation,
  FieldPresentationVariant,
  FieldValidationRule,
} from "./field-capabilities.ts";

export const SPEC_VERSION = 1 as const;

export const VALUE_SEMANTICS = ["neutral", "info", "success", "warning", "danger"] as const;
export type ValueSemantic = (typeof VALUE_SEMANTICS)[number];
export type StoreKind = "local";
export type ActorKind = "human" | "agent" | "system";
export type Exposure = "ui" | "agent";
export type SortDirection = "asc" | "desc";
export type AggregateOp = "count" | "sum" | "avg" | "min" | "max";
export type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "empty"
  | "not_empty"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export const FILTER_OPERATORS: readonly FilterOp[] = [
  "eq",
  "neq",
  "contains",
  "empty",
  "not_empty",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
];

export interface FilterClause {
  field: string;
  op?: FilterOp;
  value?: unknown;
}

export type FieldCondition =
  | { all: FieldCondition[] }
  | { any: FieldCondition[] }
  | { not: FieldCondition }
  | FilterClause;

export interface FieldValidation {
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  pattern?: string;
  message?: string;
}

export interface StoreDef extends SpecNode {
  key: string;
  label: string;
  kind: StoreKind;
}

export interface FieldDef extends SpecNode {
  key: string;
  label: string;
  type: FieldKind;
  description?: string;
  placeholder?: string;
  required?: boolean;
  default?: unknown;
  values?: string[];
  target?: string;
  format?: FieldFormat;
  currency?: string;
  presentation?: FieldPresentation;
  variant?: FieldPresentationVariant;
  max?: number;
  value_semantics?: Record<string, ValueSemantic>;
  validation?: FieldValidation;
  visible_when?: FieldCondition;
  enabled_when?: FieldCondition;
  required_when?: FieldCondition;
  hidden_value?: "preserve" | "clear";
}

export interface TypeDef extends SpecNode {
  key: string;
  label: string;
  /** Optional plural name used for lists and navigation. */
  collection_label?: string;
  store: StoreKind;
  /** Available to spaces this space’s users create. Whole type, all fields. */
  expose?: boolean;
  fields: FieldDef[];
  lifecycle?: TypeLifecycleDef;
}

export interface TypeTransitionDef {
  key: string;
  label: string;
  from: string[];
  to: string;
}

export interface TypeLifecycleDef {
  field: string;
  initial: string;
  terminal?: string[];
  transitions: TypeTransitionDef[];
}

export interface ViewDef extends SpecNode {
  key: string;
  label: string;
  source: string;
  fields: string[];
  where?: FilterClause[] | Record<string, unknown>;
  expose?: string[];
  limit?: number;
  order_by?: Record<string, SortDirection>;
  group_by?: string;
  measures?: Record<string, ViewMeasure>;
  implicit?: boolean;
}

export interface ViewMeasure {
  op: AggregateOp;
  field?: string;
  fields?: string[];
}

export interface FormDef extends SpecNode {
  key: string;
  label: string;
  /** Record type used by create and edit forms. Standalone forms have no record source. */
  type?: string;
  /** Ordered references to fields on the record type. */
  fields?: string[];
  /** Ordered, form-owned input definitions for standalone forms. */
  inputs?: FieldDef[];
  mode: "create" | "edit" | "standalone";
  submit?: {
    /** Optional presentation shown after a standalone form succeeds. */
    success?: { title?: string; description?: string };
  };
  implicit?: boolean;
}

export type WorkflowStep = AutomationStep;
export type WorkflowDef = AutomationDefinition;

export type PageRowHeight = "s" | "m" | "l" | "xl";

export type PageBlock =
  | { kind: "widget"; widget: string; values?: Record<string, unknown> }
  | { kind: "group"; columns?: number; min_height?: PageRowHeight; blocks: PageBlock[] };

export interface PageDef extends SpecNode {
  key: string;
  label: string;
  path?: string;
  folder?: string;
  icon?: string;
  blocks: PageBlock[];
  implicit?: boolean;
}

export interface AppSpec {
  version: typeof SPEC_VERSION;
  key: string;
  label: string;
  meta?: SpecMeta;
  stores: StoreDef[];
  types: TypeDef[];
  views: ViewDef[];
  forms: FormDef[];
  workflows: WorkflowDef[];
  pages: PageDef[];
}

export interface Actor {
  id: string;
  name: string;
  email?: string;
  kind: ActorKind;
  roles: string[];
}

export interface ExecutionContext {
  actorId: string;
  spaceId: string;
  appId: string;
}

export interface RecordValue {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  [key: string]: unknown;
}

const FIELD_PROPERTIES = new Set([
  "id",
  "meta",
  "key",
  "label",
  "type",
  "description",
  "placeholder",
  "required",
  "default",
  "values",
  "target",
  "format",
  "currency",
  "presentation",
  "variant",
  "max",
  "value_semantics",
  "validation",
  "visible_when",
  "enabled_when",
  "required_when",
  "hidden_value",
]);
export const RESERVED_FIELD_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
]);

export function emptySpec(key = "app", label = "App"): AppSpec {
  return {
    version: SPEC_VERSION,
    key,
    label,
    stores: [
      {
        id: createSpecId(),
        key: "local",
        label: "App",
        kind: "local",
      },
    ],
    types: [],
    views: [],
    forms: [],
    workflows: [],
    pages: [],
  };
}

export function defaultLocalStore(): StoreDef {
  return {
    id: createSpecId(),
    key: "local",
    label: "App",
    kind: "local",
  };
}

export function isExposed(type: Pick<TypeDef, "expose">): boolean {
  return Boolean(type.expose);
}

export type FieldDraft = FieldKind | Partial<FieldDef>;
export type TypeDraft = Partial<Omit<TypeDef, "fields" | "lifecycle">> & {
  fields?: Record<string, FieldDraft> | FieldDraft[];
  lifecycle?: TypeLifecycleDef | null;
};
type ViewDraft = Partial<ViewDef> & {
  groupBy?: string;
  sort?: Array<{ field: string; direction?: SortDirection }>;
};
export type FormDraft = Partial<Omit<FormDef, "inputs">> & {
  inputs?: Record<string, FieldDraft> | FieldDraft[];
};
type SpecDraft = Partial<
  Omit<AppSpec, "types" | "views" | "forms" | "workflows" | "pages" | "stores">
> & {
  types?: Record<string, TypeDraft> | TypeDef[];
  views?: Record<string, ViewDraft> | ViewDraft[];
  forms?: Record<string, FormDraft> | FormDraft[];
  workflows?: Record<string, Partial<WorkflowDef>> | WorkflowDef[];
  pages?: Record<string, Partial<PageDef>> | PageDef[];
  stores?: Record<string, Partial<StoreDef>> | StoreDef[];
};

const SPEC_PROPERTIES = new Set([
  "version",
  "key",
  "label",
  "meta",
  "stores",
  "types",
  "views",
  "forms",
  "workflows",
  "pages",
]);

function asEntries<T>(value: Record<string, T> | T[] | undefined): Array<[string | undefined, T]> {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => [undefined, item]);
  return Object.entries(value);
}

export function normalizeFieldKey(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new Error("Field needs a non-empty key or label");
  let key = slugify(raw);
  if (!key) throw new Error("Field needs a non-empty key or label");
  if (/^\d/.test(key)) key = `field_${key}`;
  if (RESERVED_FIELD_KEYS.has(key)) {
    throw new Error(`Field key "${key}" is reserved for system data`);
  }
  return key;
}

function fieldKeyFrom(mapKey: string | undefined, draft: FieldDraft): string {
  const fromDraft =
    typeof draft === "object" && draft && "key" in draft ? String(draft.key ?? "").trim() : "";
  const label =
    typeof draft === "object" && draft && "label" in draft ? String(draft.label ?? "").trim() : "";
  const namedMapKey = mapKey && !/^\d+$/.test(mapKey) ? mapKey.trim() : "";
  return normalizeFieldKey(namedMapKey || fromDraft || label || mapKey);
}

export function normalizeField(key: string, draft: FieldDraft, existing?: FieldDef): FieldDef {
  const objectDraft: Partial<FieldDef> =
    typeof draft === "string" ? { type: draft as FieldKind } : { ...draft };
  for (const property of Object.keys(objectDraft)) {
    if (!FIELD_PROPERTIES.has(property)) {
      throw new Error(`Unknown field property "${property}" on ${key}`);
    }
  }
  const type = (objectDraft.type || existing?.type || "text") as FieldKind;
  if (!FIELD_KINDS.includes(type)) {
    throw new Error(`Unknown field type "${String(type)}" on ${key}`);
  }
  const field: FieldDef = {
    ...normalizeSpecNode(objectDraft, existing, `Field ${key}`),
    key,
    label:
      String(objectDraft.label ?? "").trim() ||
      String(existing?.label ?? "").trim() ||
      labelFromKey(key),
    type,
  };
  const description = String(
    Object.hasOwn(objectDraft, "description")
      ? (objectDraft.description ?? "")
      : (existing?.description ?? ""),
  ).trim();
  const placeholder = String(
    Object.hasOwn(objectDraft, "placeholder")
      ? (objectDraft.placeholder ?? "")
      : (existing?.placeholder ?? ""),
  ).trim();
  if (description) field.description = description;
  if (placeholder) field.placeholder = placeholder;
  if (objectDraft.required ?? existing?.required) field.required = true;
  if (objectDraft.default !== undefined) field.default = objectDraft.default;
  else if (existing?.default !== undefined) field.default = existing.default;
  if (type === "enum") {
    field.values = objectDraft.values || existing?.values || [];
  }
  if (type === "reference") {
    const target = objectDraft.target || existing?.target;
    if (!target) throw new Error(`Reference field "${key}" needs a target`);
    field.target = target;
  }
  const presentation = Object.hasOwn(objectDraft, "presentation")
    ? objectDraft.presentation
    : existing?.presentation;
  if (presentation && !supportsFieldPresentation(type, presentation)) {
    throw new Error(`Presentation "${String(presentation)}" is not supported by ${type} fields`);
  }
  assertFieldConfiguration(type, key, objectDraft, presentation);
  if (type === "text" && presentation === "textarea") {
    field.presentation = "textarea";
  } else if (type === "number" && presentation === "rating") {
    const requestedMax = Number(objectDraft.max ?? existing?.max ?? 10);
    field.presentation = "rating";
    field.variant = "segments";
    field.max = Number.isFinite(requestedMax)
      ? Math.min(10, Math.max(2, Math.round(requestedMax)))
      : 10;
  } else if (type === "enum" && presentation === "badge") {
    field.presentation = "badge";
    const semantics = objectDraft.value_semantics ?? existing?.value_semantics ?? {};
    const choices = new Set(field.values);
    for (const [value, semantic] of Object.entries(semantics)) {
      if (!choices.has(value)) {
        throw new Error(`Badge semantic value "${value}" is not a choice on ${key}`);
      }
      if (!VALUE_SEMANTICS.includes(semantic)) {
        throw new Error(`Unknown badge semantic "${String(semantic)}" on ${key}.${value}`);
      }
    }
    if (Object.keys(semantics).length) field.value_semantics = { ...semantics };
  }
  const format = Object.hasOwn(objectDraft, "format") ? objectDraft.format : existing?.format;
  if (format && field.presentation === "rating") {
    throw new Error(`Rating field "${key}" cannot also use a number format`);
  }
  if (format && !supportsFieldFormat(type, format)) {
    throw new Error(`Format "${String(format)}" is not supported by ${type} fields`);
  }
  if (format) field.format = format;
  if (field.format === "currency") {
    const currency = String(
      Object.hasOwn(objectDraft, "currency")
        ? (objectDraft.currency ?? "")
        : (existing?.currency ?? ""),
    )
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Currency field "${key}" needs a three-letter currency code`);
    }
    field.currency = currency;
  }
  const validation = normalizeFieldValidation(
    Object.hasOwn(objectDraft, "validation") ? objectDraft.validation : existing?.validation,
    type,
    key,
  );
  if (validation) field.validation = validation;
  for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
    const condition = Object.hasOwn(objectDraft, property)
      ? objectDraft[property]
      : existing?.[property];
    if (condition) field[property] = cloneData(condition);
  }
  const hiddenValue = Object.hasOwn(objectDraft, "hidden_value")
    ? objectDraft.hidden_value
    : existing?.hidden_value;
  if (hiddenValue === "clear") field.hidden_value = "clear";
  if (field.hidden_value === "clear" && !field.visible_when) {
    throw new Error(`Field "${key}" can only clear hidden values when visible_when is configured`);
  }
  return field;
}

function assertFieldConfiguration(
  type: FieldKind,
  key: string,
  draft: Partial<FieldDef>,
  presentation: FieldPresentation | undefined,
): void {
  const supplied = (property: keyof FieldDef) =>
    Object.hasOwn(draft, property) && draft[property] !== undefined && draft[property] !== null;
  const clearingPresentation = Object.hasOwn(draft, "presentation") && draft.presentation == null;
  const clearingFormat = Object.hasOwn(draft, "format") && draft.format == null;
  if (supplied("values") && type !== "enum") {
    throw new Error(`Field "${key}" can only declare values when its type is enum`);
  }
  if (supplied("target") && type !== "reference") {
    throw new Error(`Field "${key}" can only declare target when its type is reference`);
  }
  if (supplied("currency") && draft.format !== "currency" && !clearingFormat) {
    throw new Error(`Field "${key}" can only declare currency when its format is currency`);
  }
  if (
    (supplied("variant") || supplied("max")) &&
    presentation !== "rating" &&
    !clearingPresentation
  ) {
    throw new Error(`Field "${key}" can only declare rating options with rating presentation`);
  }
  if (supplied("value_semantics") && presentation !== "badge" && !clearingPresentation) {
    throw new Error(`Field "${key}" can only declare value semantics with badge presentation`);
  }
}

function normalizeFieldValidation(
  draft: FieldValidation | undefined,
  type: FieldKind,
  fieldKey: string,
): FieldValidation | undefined {
  if (!draft) return undefined;
  const capability = fieldCapability(type);
  const known = new Set(["min", "max", "min_length", "max_length", "pattern", "message"]);
  for (const key of Object.keys(draft)) {
    if (!known.has(key)) throw new Error(`Unknown validation rule "${key}" on ${fieldKey}`);
    const value = draft[key as keyof FieldValidation];
    const supplied = value !== undefined && value !== null && value !== "";
    if (supplied && key !== "message" && !capability.validation.includes(key as never)) {
      throw new Error(`Validation rule "${key}" is not supported by ${type} fields`);
    }
  }
  const validation: FieldValidation = {};
  for (const key of ["min", "max", "min_length", "max_length"] as const) {
    const raw: unknown = draft[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) validation[key] = value;
  }
  const pattern = String(draft.pattern ?? "").trim();
  const message = String(draft.message ?? "").trim();
  if (pattern) validation.pattern = pattern;
  if (message) validation.message = message;
  return Object.keys(validation).length ? validation : undefined;
}

function normalizeType(key: string, draft: TypeDraft, existing?: TypeDef): TypeDef {
  if (draft.store !== undefined && draft.store !== "local") {
    throw new Error(`Unknown store "${String(draft.store)}" on ${key}`);
  }
  const existingByKey = new Map((existing?.fields ?? []).map((field) => [field.key, field]));
  const existingById = new Map((existing?.fields ?? []).map((field) => [field.id, field]));
  const fieldSource = draft.fields !== undefined ? draft.fields : existing?.fields;
  const seen = new Set<string>();
  const fields = asEntries(fieldSource as TypeDraft["fields"]).map(([fieldKey, fieldDraft]) => {
    const resolvedKey = fieldKeyFrom(fieldKey, fieldDraft as FieldDraft);
    if (seen.has(resolvedKey)) throw new Error(`Duplicate field key "${resolvedKey}" on ${key}`);
    seen.add(resolvedKey);
    const draftId =
      typeof fieldDraft === "object" && fieldDraft && "id" in fieldDraft
        ? String(fieldDraft.id ?? "")
        : "";
    return normalizeField(
      resolvedKey,
      fieldDraft as FieldDraft,
      (draftId ? existingById.get(draftId) : undefined) ?? existingByKey.get(resolvedKey),
    );
  });
  validateFieldCapabilities(key, fields);
  const expose = draft.expose ?? existing?.expose;
  const collectionLabel = Object.hasOwn(draft, "collection_label")
    ? String(draft.collection_label ?? "").trim()
    : existing?.collection_label;
  const type: TypeDef = {
    ...normalizeSpecNode(draft, existing, `Type ${key}`),
    key,
    label: draft.label || existing?.label || labelFromKey(key),
    ...(collectionLabel ? { collection_label: collectionLabel } : {}),
    store: "local",
    ...(expose ? { expose: true as const } : {}),
    fields,
  };
  const lifecycle = Object.hasOwn(draft, "lifecycle") ? draft.lifecycle : existing?.lifecycle;
  if (lifecycle) type.lifecycle = normalizeTypeLifecycle(type, lifecycle);
  return type;
}

export function validateFieldCapabilities(typeKey: string, fields: FieldDef[]): void {
  const keys = new Set(fields.map((field) => field.key));
  const dependencies = new Map<string, Set<string>>();
  for (const field of fields) {
    const validation = field.validation;
    if (
      validation?.min !== undefined &&
      validation.max !== undefined &&
      validation.min > validation.max
    ) {
      throw new Error(`Validation minimum exceeds maximum on ${typeKey}.${field.key}`);
    }
    if (
      validation?.min_length !== undefined &&
      validation.max_length !== undefined &&
      validation.min_length > validation.max_length
    ) {
      throw new Error(
        `Validation minimum length exceeds maximum length on ${typeKey}.${field.key}`,
      );
    }
    if (validation?.pattern) {
      try {
        new RegExp(validation.pattern);
      } catch {
        throw new Error(`Invalid validation pattern on ${typeKey}.${field.key}`);
      }
    }
    for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
      const condition = field[property];
      if (!condition) continue;
      validateFieldCondition(condition, `${typeKey}.${field.key}.${property}`);
      for (const dependency of fieldConditionKeys(condition)) {
        if (!keys.has(dependency)) {
          throw new Error(`Unknown condition field "${dependency}" on ${typeKey}.${field.key}`);
        }
        if (dependency === field.key) {
          throw new Error(`Field ${typeKey}.${field.key} cannot depend on itself`);
        }
        const current = dependencies.get(field.key) ?? new Set<string>();
        current.add(dependency);
        dependencies.set(field.key, current);
      }
    }
  }
  assertNoFieldConditionCycles(typeKey, dependencies);
}

function validateFieldCondition(condition: FieldCondition, path: string): void {
  if ("all" in condition || "any" in condition) {
    const group = "all" in condition ? condition.all : condition.any;
    if (!Array.isArray(group) || !group.length) {
      throw new Error(`Field condition group on ${path} cannot be empty`);
    }
    group.forEach((item, index) => validateFieldCondition(item, `${path}.${index}`));
    return;
  }
  if ("not" in condition) {
    if (!condition.not || typeof condition.not !== "object") {
      throw new Error(`Field condition on ${path}.not needs a condition`);
    }
    validateFieldCondition(condition.not, `${path}.not`);
    return;
  }
  if (!String(condition.field ?? "").trim()) {
    throw new Error(`Field condition on ${path} needs a field`);
  }
  const op = condition.op ?? "eq";
  if (!FILTER_OPERATORS.includes(op)) {
    throw new Error(`Unknown field condition operator "${String(op)}" on ${path}`);
  }
  if (op === "in" && !Array.isArray(condition.value)) {
    throw new Error(`Field condition operator "in" on ${path} needs an array value`);
  }
}

function assertNoFieldConditionCycles(
  typeKey: string,
  dependencies: Map<string, Set<string>>,
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (field: string) => {
    if (visiting.has(field)) {
      throw new Error(`Conditional fields on ${typeKey} contain a cycle involving "${field}"`);
    }
    if (visited.has(field)) return;
    visiting.add(field);
    for (const dependency of dependencies.get(field) ?? []) visit(dependency);
    visiting.delete(field);
    visited.add(field);
  };
  for (const field of dependencies.keys()) visit(field);
}

function fieldConditionKeys(condition: FieldCondition): string[] {
  if ("all" in condition) return condition.all.flatMap(fieldConditionKeys);
  if ("any" in condition) return condition.any.flatMap(fieldConditionKeys);
  if ("not" in condition) return fieldConditionKeys(condition.not);
  return [condition.field];
}

export function normalizeTypeLifecycle(
  type: Pick<TypeDef, "key" | "fields">,
  lifecycle: TypeLifecycleDef,
): TypeLifecycleDef {
  const field = type.fields.find((item) => item.key === lifecycle.field);
  if (!field) throw new Error(`Lifecycle field "${lifecycle.field}" does not exist on ${type.key}`);
  if (field.type !== "enum") {
    throw new Error(`Lifecycle field "${lifecycle.field}" on ${type.key} must be an enum`);
  }
  const states = new Set(field.values ?? []);
  if (!states.has(lifecycle.initial)) {
    throw new Error(
      `Lifecycle initial state "${lifecycle.initial}" is not a choice on ${type.key}.${field.key}`,
    );
  }
  if (field.default !== undefined && field.default !== lifecycle.initial) {
    throw new Error(
      `Lifecycle field default on ${type.key}.${field.key} must match initial state "${lifecycle.initial}"`,
    );
  }
  const terminal = [...new Set(lifecycle.terminal ?? [])];
  for (const state of terminal) {
    if (!states.has(state)) {
      throw new Error(
        `Lifecycle terminal state "${state}" is not a choice on ${type.key}.${field.key}`,
      );
    }
  }
  const keys = new Set<string>();
  const pairs = new Set<string>();
  const transitions = (lifecycle.transitions ?? []).map((transition) => {
    const key = slugify(transition.key);
    if (!key) throw new Error(`Lifecycle transition on ${type.key} needs a key`);
    if (keys.has(key))
      throw new Error(`Duplicate lifecycle transition key "${key}" on ${type.key}`);
    keys.add(key);
    const from = [...new Set(transition.from ?? [])];
    if (!from.length)
      throw new Error(`Lifecycle transition "${key}" needs at least one from state`);
    if (!states.has(transition.to)) {
      throw new Error(`Lifecycle transition "${key}" has unknown target state "${transition.to}"`);
    }
    for (const state of from) {
      if (!states.has(state)) {
        throw new Error(`Lifecycle transition "${key}" has unknown source state "${state}"`);
      }
      if (terminal.includes(state)) {
        throw new Error(`Terminal lifecycle state "${state}" cannot have outgoing transitions`);
      }
      if (state === transition.to) {
        throw new Error(`Lifecycle transition "${key}" must change state`);
      }
      const pair = `${state}\u0000${transition.to}`;
      if (pairs.has(pair)) {
        throw new Error(`Lifecycle transition from "${state}" to "${transition.to}" is ambiguous`);
      }
      pairs.add(pair);
    }
    return {
      key,
      label: String(transition.label ?? "").trim() || labelFromKey(key),
      from,
      to: transition.to,
    };
  });
  return {
    field: field.key,
    initial: lifecycle.initial,
    ...(terminal.length ? { terminal } : {}),
    transitions,
  };
}

function namedList<T extends { id?: string; key?: string; label?: string; meta?: SpecMeta }>(
  value: Record<string, T> | T[] | undefined,
  existing: T[] = [],
): T[] {
  const existingByKey = new Map(existing.map((item) => [item.key, item]));
  const existingById = new Map(existing.map((item) => [item.id, item]));
  return asEntries(value).map(([mapKey, draft]) => {
    const key = mapKey || draft.key || slugify(draft.label || "item");
    const previous = (draft.id ? existingById.get(draft.id) : undefined) ?? existingByKey.get(key);
    return {
      ...previous,
      ...draft,
      ...normalizeSpecNode(draft, previous, `Spec item ${key}`),
      key,
      label: draft.label || previous?.label || labelFromKey(key),
    };
  });
}

function normalizeSpecNode(
  draft: { id?: string; meta?: SpecMeta },
  existing: { id?: string; meta?: SpecMeta } | undefined,
  owner: string,
): SpecNode {
  const id = draft.id || existing?.id || createSpecId();
  if (!isSpecId(id)) throw new Error(`${owner} needs a 16-character base-62 id`);
  const metaSource = Object.hasOwn(draft, "meta") ? draft.meta : existing?.meta;
  const meta = normalizeSpecMeta(metaSource, owner);
  return { id, ...(meta ? { meta } : {}) };
}

const AGGREGATE_OPS = new Set<AggregateOp>(["count", "sum", "avg", "min", "max"]);

export function normalizeView(view: ViewDraft & Pick<ViewDef, "id" | "key" | "label">): ViewDef {
  const { groupBy, sort, ...base } = view;
  const groupByField = String(base.group_by ?? groupBy ?? "").trim();
  const measures = Object.fromEntries(
    Object.entries(base.measures ?? {}).map(([alias, draft]) => {
      const op = String(draft.op) as AggregateOp;
      if (!AGGREGATE_OPS.has(op)) throw new Error(`Unknown aggregate op "${op}" on ${alias}`);
      const field = String(draft.field ?? "").trim();
      const fields = (draft.fields ?? []).map((item) => String(item).trim()).filter(Boolean);
      if (op !== "count" && !field && !(op === "avg" && fields.length)) {
        throw new Error(`Aggregate measure "${alias}" needs a field`);
      }
      return [
        alias,
        {
          op,
          ...(field ? { field } : {}),
          ...(op === "avg" && fields.length ? { fields } : {}),
        } satisfies ViewMeasure,
      ];
    }),
  );
  const orderBy =
    base.order_by ??
    (sort?.length
      ? Object.fromEntries(
          sort.filter((item) => item.field).map((item) => [item.field, item.direction ?? "asc"]),
        )
      : undefined);
  const fields = base.fields?.length
    ? base.fields
    : groupByField
      ? [groupByField, ...Object.keys(measures)]
      : [];
  return {
    ...base,
    source: base.source ?? "",
    fields,
    ...(orderBy && Object.keys(orderBy).length ? { order_by: orderBy } : {}),
    ...(groupByField ? { group_by: groupByField } : {}),
    ...(Object.keys(measures).length ? { measures } : {}),
  };
}

function normalizeForm(
  draft: FormDraft & Pick<FormDef, "id" | "key" | "label">,
  existing?: FormDef,
): FormDef {
  const mode = draft.mode ?? existing?.mode ?? (draft.type ? "create" : "standalone");
  if (!["create", "edit", "standalone"].includes(mode)) {
    throw new Error(`Unknown form mode "${String(mode)}" on ${draft.key}`);
  }
  const submit = normalizeFormSubmit(draft.submit, mode, draft.key);
  if (mode === "standalone") {
    const existingInputs = existing?.mode === "standalone" ? (existing.inputs ?? []) : [];
    const existingByKey = new Map(existingInputs.map((field) => [field.key, field]));
    const existingById = new Map(existingInputs.map((field) => [field.id, field]));
    const source = draft.inputs !== undefined ? draft.inputs : existingInputs;
    const seen = new Set<string>();
    const inputs = asEntries(source as FormDraft["inputs"]).map(([fieldKey, fieldDraft]) => {
      const key = fieldKeyFrom(fieldKey, fieldDraft as FieldDraft);
      if (seen.has(key)) throw new Error(`Duplicate input key "${key}" on form ${draft.key}`);
      seen.add(key);
      const id =
        typeof fieldDraft === "object" && fieldDraft && "id" in fieldDraft
          ? String(fieldDraft.id ?? "")
          : "";
      return normalizeField(
        key,
        fieldDraft as FieldDraft,
        (id ? existingById.get(id) : undefined) ?? existingByKey.get(key),
      );
    });
    if (!inputs.length) throw new Error(`${draft.label} needs at least one input`);
    validateFieldCapabilities(`form ${draft.key}`, inputs);
    return {
      id: draft.id,
      ...(draft.meta ? { meta: draft.meta } : {}),
      key: draft.key,
      label: draft.label,
      mode,
      inputs,
      ...(submit ? { submit } : {}),
      ...(draft.implicit ? { implicit: true } : {}),
    };
  }
  const type = String(draft.type ?? existing?.type ?? "").trim();
  if (!type) throw new Error(`${draft.label} needs a record type`);
  return {
    id: draft.id,
    ...(draft.meta ? { meta: draft.meta } : {}),
    key: draft.key,
    label: draft.label,
    type,
    fields: [...(draft.fields ?? existing?.fields ?? [])],
    mode,
    ...(submit ? { submit } : {}),
    ...(draft.implicit ? { implicit: true } : {}),
  };
}

function normalizeFormSubmit(
  value: FormDef["submit"] | undefined,
  mode: FormDef["mode"],
  formKey: string,
): FormDef["submit"] | undefined {
  if (!value) return undefined;
  for (const property of Object.keys(value)) {
    if (property !== "success") {
      throw new Error(`Unknown form submit property "${property}" on ${formKey}`);
    }
  }
  if (!value.success) return undefined;
  if (mode !== "standalone") {
    throw new Error(`Success messages are only supported by standalone forms`);
  }
  for (const property of Object.keys(value.success)) {
    if (property !== "title" && property !== "description") {
      throw new Error(`Unknown form success property "${property}" on ${formKey}`);
    }
  }
  const title = String(value.success.title ?? "").trim();
  const description = String(value.success.description ?? "").trim();
  return title || description
    ? { success: { ...(title ? { title } : {}), ...(description ? { description } : {}) } }
    : undefined;
}

export function normalizeSpec(input: SpecDraft | AppSpec, existing?: AppSpec): AppSpec {
  for (const property of Object.keys(input)) {
    if (!SPEC_PROPERTIES.has(property)) throw new Error(`Unknown spec property "${property}"`);
  }
  const key = input.key || existing?.key || "app";
  const meta = normalizeSpecMeta(
    Object.hasOwn(input, "meta") ? input.meta : existing?.meta,
    `App ${key}`,
  );
  const storeDrafts = namedList(input.stores, existing?.stores);
  for (const store of storeDrafts) {
    if ((store.key && store.key !== "local") || (store.kind && store.kind !== "local")) {
      throw new Error(`Unknown store "${String(store.key || store.kind)}"`);
    }
  }
  const stores = storeDrafts.map((store) => ({
    id: store.id || createSpecId(),
    ...(store.meta ? { meta: store.meta } : {}),
    key: store.key || "local",
    label: store.label || "App",
    kind: "local" as const,
  })) as StoreDef[];
  if (!stores.some((store) => store.key === "local")) {
    stores.unshift(defaultLocalStore());
  }
  const existingTypes = new Map((existing?.types ?? []).map((type) => [type.key, type]));
  const existingTypesById = new Map((existing?.types ?? []).map((type) => [type.id, type]));
  const types = asEntries(input.types).map(([typeKey, draft]) => {
    const resolvedKey =
      typeKey || (draft as TypeDef).key || slugify((draft as TypeDef).label || "type");
    const draftId = String((draft as TypeDef).id ?? "");
    return normalizeType(
      resolvedKey,
      draft as TypeDraft,
      (draftId ? existingTypesById.get(draftId) : undefined) ?? existingTypes.get(resolvedKey),
    );
  });
  const spec: AppSpec = {
    version: SPEC_VERSION,
    key,
    label: input.label || existing?.label || labelFromKey(key),
    ...(meta ? { meta } : {}),
    stores,
    types,
    views: (namedList(input.views as never, existing?.views as never) as ViewDef[]).map(
      normalizeView,
    ),
    forms: namedList(input.forms as never, existing?.forms as never).map((form) =>
      normalizeForm(
        form as FormDraft & Pick<FormDef, "id" | "key" | "label">,
        existing?.forms.find(
          (item) => item.id === (form as FormDef).id || item.key === (form as FormDef).key,
        ),
      ),
    ),
    workflows: (
      namedList(input.workflows as never, existing?.workflows as never) as WorkflowDef[]
    ).map(normalizeWorkflow),
    pages: namedList(input.pages as never, existing?.pages as never) as PageDef[],
  };
  for (const view of spec.views) {
    view.source = view.source || spec.types[0]?.key || "";
    view.fields = view.fields || [];
  }
  for (const workflow of spec.workflows) {
    workflow.steps = workflow.steps || [];
  }
  for (const page of spec.pages) {
    page.blocks = page.blocks || [];
  }
  assertUniqueSpecIds(spec);
  return spec;
}

function assertUniqueSpecIds(spec: AppSpec): void {
  const seen = new Map<string, string>();
  const add = (node: SpecNode, owner: string) => {
    const previous = seen.get(node.id);
    if (previous) throw new Error(`Duplicate spec id "${node.id}" on ${previous} and ${owner}`);
    seen.set(node.id, owner);
  };
  for (const store of spec.stores) add(store, `store ${store.key}`);
  for (const type of spec.types) {
    add(type, `type ${type.key}`);
    for (const field of type.fields) add(field, `field ${type.key}.${field.key}`);
  }
  for (const view of spec.views) add(view, `view ${view.key}`);
  for (const form of spec.forms) {
    add(form, `form ${form.key}`);
    for (const input of form.inputs ?? []) add(input, `input ${form.key}.${input.key}`);
  }
  for (const workflow of spec.workflows) add(workflow, `workflow ${workflow.key}`);
  for (const page of spec.pages) add(page, `page ${page.key}`);
}

function normalizeWorkflow(workflow: WorkflowDef): WorkflowDef {
  const normalized = {
    ...workflow,
    enabled: workflow.enabled ?? true,
    priority: workflow.priority ?? 0,
    steps: workflow.steps ?? [],
  };
  assertValidAutomation(normalized);
  return normalized;
}

/**
 * Deep-clone own data into plain objects/arrays.
 * Walks through proxies (including Svelte `$state`) by reading properties,
 * so the result is always structured-cloneable.
 */
export function cloneData<T>(value: T): T {
  return walkClone(value, new Map()) as T;
}

function walkClone(value: unknown, seen: Map<unknown, unknown>): unknown {
  if (value === null || typeof value !== "object") return value;
  const cached = seen.get(value);
  if (cached) return cached;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let index = 0; index < value.length; index++) {
      if (index in value) copy[index] = walkClone(value[index], seen);
    }
    return copy;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) {
      copy[key] = walkClone((value as Record<string, unknown>)[key], seen);
    }
    return copy;
  }
  try {
    const copy = structuredClone(value);
    seen.set(value, copy);
    return copy;
  } catch {
    return value;
  }
}

export function cloneSpec(spec: AppSpec): AppSpec {
  return cloneData(spec);
}

export function typeByKey(spec: AppSpec, key: string): TypeDef | undefined {
  return spec.types.find((type) => type.key === key);
}

export function typeById(spec: AppSpec, id: string): TypeDef | undefined {
  return spec.types.find((type) => type.id === id);
}

export function fieldByKey(type: TypeDef, key: string): FieldDef | undefined {
  return type.fields.find((field) => field.key === key);
}

export function storeByKey(spec: AppSpec, key: string): StoreDef | undefined {
  return spec.stores.find((store) => store.key === key);
}

export function parseTypeRef(target: string): { store?: string; type: string } {
  if (target.includes(".")) {
    const [store, type] = target.split(".", 2);
    return { store, type };
  }
  return { type: target };
}

export function resolveTypeRef(
  spec: AppSpec,
  target: string,
  shared?: TypeDef[],
): TypeDef | undefined {
  const parsed = parseTypeRef(target);
  return (
    spec.types.find((type) => type.key === parsed.type) ||
    shared?.find((type) => type.key === parsed.type)
  );
}

export function mergedTypes(workspace: AppSpec, sharedTypes: TypeDef[]): TypeDef[] {
  const localKeys = new Set(workspace.types.map((type) => type.key));
  return [...sharedTypes.filter((type) => !localKeys.has(type.key)), ...workspace.types];
}

export function sqlTypeFor(field: FieldDef): string {
  switch (field.type) {
    case "number":
      return "REAL";
    case "boolean":
    case "reference":
      return "INTEGER";
    default:
      return "TEXT";
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
