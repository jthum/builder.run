import { createId, labelFromKey, slugify } from "./ids.ts";

export const SPEC_VERSION = 1 as const;

export type FieldKind = "text" | "number" | "date" | "boolean" | "enum" | "reference";
export type StoreKind = "workspace" | "shared";
export type ActorKind = "human" | "agent" | "system";
export type Exposure = "ui" | "agent";
export type SortDirection = "asc" | "desc";

export interface StoreDef {
  id: string;
  key: string;
  label: string;
  kind: StoreKind;
}

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldKind;
  required?: boolean;
  default?: unknown;
  values?: string[];
  target?: string;
}

export interface TypeDef {
  id: string;
  key: string;
  label: string;
  store: string;
  fields: FieldDef[];
}

export interface ViewDef {
  id: string;
  key: string;
  label: string;
  source: string;
  fields: string[];
  where?: Record<string, unknown>;
  order_by?: Record<string, SortDirection>;
  implicit?: boolean;
}

export interface FormDef {
  id: string;
  key: string;
  label: string;
  type: string;
  fields: string[];
  mode: "create" | "edit" | "custom";
  submit?: { flow?: string };
  implicit?: boolean;
}

export type FlowStep =
  | { create: { type: string; as?: string; fields: Record<string, unknown> } }
  | { set: Record<string, unknown> }
  | { delete: { ref: string } }
  | { query: { view?: string; type?: string; as: string; where?: Record<string, unknown> } }
  | { when: { condition: Condition; then: FlowStep[]; else?: FlowStep[] } }
  | { invoke: { flow: string; input?: Record<string, unknown> } };

export type Condition = string | Record<string, unknown>;

export interface FlowDef {
  id: string;
  key: string;
  label: string;
  input?: Record<string, string>;
  when?: Condition;
  trigger?: { when: string };
  expose?: Exposure[];
  steps: FlowStep[];
}

export type PageBlock =
  | { kind: "view"; view: string }
  | { kind: "form"; form: string }
  | { kind: "record"; type: string }
  | { kind: "action"; flow: string; label?: string }
  | { kind: "text"; text: string }
  | { kind: "group"; blocks: PageBlock[] };

export interface PageDef {
  id: string;
  key: string;
  label: string;
  path?: string;
  blocks: PageBlock[];
  implicit?: boolean;
}

export interface AppSpec {
  version: typeof SPEC_VERSION;
  key: string;
  label: string;
  stores: StoreDef[];
  types: TypeDef[];
  views: ViewDef[];
  forms: FormDef[];
  flows: FlowDef[];
  pages: PageDef[];
}

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  roles: string[];
}

export interface ExecutionContext {
  actorId: string;
  environmentId: string;
  workspaceId: string;
}

export interface RecordValue {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  [key: string]: unknown;
}

export const FIELD_KINDS: FieldKind[] = ["text", "number", "date", "boolean", "enum", "reference"];

export function emptySpec(key = "app", label = "App"): AppSpec {
  return {
    version: SPEC_VERSION,
    key,
    label,
    stores: [
      {
        id: createId("sto"),
        key: "local",
        label: "Workspace",
        kind: "workspace",
      },
    ],
    types: [],
    views: [],
    forms: [],
    flows: [],
    pages: [],
  };
}

export function sharedDirectoryStores(): StoreDef[] {
  return [
    {
      id: createId("sto"),
      key: "directory",
      label: "Directory",
      kind: "shared",
    },
    {
      id: createId("sto"),
      key: "local",
      label: "Workspace",
      kind: "workspace",
    },
  ];
}

export function defaultLocalStore(): StoreDef {
  return {
    id: createId("sto"),
    key: "local",
    label: "Workspace",
    kind: "workspace",
  };
}

type FieldDraft = FieldKind | (Partial<FieldDef> & { type?: FieldKind | string });
type TypeDraft = Partial<Omit<TypeDef, "fields">> & {
  fields?: Record<string, FieldDraft> | FieldDef[] | Record<string, FieldDraft>;
};
type SpecDraft = Partial<
  Omit<AppSpec, "types" | "views" | "forms" | "flows" | "pages" | "stores">
> & {
  types?: Record<string, TypeDraft> | TypeDef[];
  views?: Record<string, Partial<ViewDef>> | ViewDef[];
  forms?: Record<string, Partial<FormDef>> | FormDef[];
  flows?: Record<string, Partial<FlowDef>> | FlowDef[];
  pages?: Record<string, Partial<PageDef>> | PageDef[];
  stores?: Record<string, Partial<StoreDef>> | StoreDef[];
};

function asEntries<T>(value: Record<string, T> | T[] | undefined): Array<[string | undefined, T]> {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => [undefined, item]);
  return Object.entries(value);
}

function normalizeField(key: string, draft: FieldDraft, existing?: FieldDef): FieldDef {
  const objectDraft: Partial<FieldDef> =
    typeof draft === "string" ? { type: draft as FieldKind } : { ...draft };
  const type = (objectDraft.type as FieldKind) || existing?.type || "text";
  if (!FIELD_KINDS.includes(type)) {
    throw new Error(`Unknown field type "${String(objectDraft.type)}" on ${key}`);
  }
  const field: FieldDef = {
    id: objectDraft.id || existing?.id || createId("fld"),
    key,
    label: objectDraft.label || existing?.label || labelFromKey(key),
    type,
  };
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
  return field;
}

function normalizeType(
  key: string,
  draft: TypeDraft,
  existing?: TypeDef,
  fallbackStore = "local",
): TypeDef {
  const existingByKey = new Map((existing?.fields ?? []).map((field) => [field.key, field]));
  const fields = asEntries(draft.fields).map(([fieldKey, fieldDraft]) => {
    const resolvedKey =
      fieldKey ||
      (fieldDraft as FieldDef).key ||
      slugify((fieldDraft as FieldDef).label || "field");
    return normalizeField(resolvedKey, fieldDraft as FieldDraft, existingByKey.get(resolvedKey));
  });
  return {
    id: draft.id || existing?.id || createId("typ"),
    key,
    label: draft.label || existing?.label || labelFromKey(key),
    store: draft.store || existing?.store || fallbackStore,
    fields,
  };
}

function namedList<T extends { id?: string; key?: string; label?: string }>(
  value: Record<string, T> | T[] | undefined,
  kind: Parameters<typeof createId>[0],
  existing: T[] = [],
): T[] {
  const existingByKey = new Map(existing.map((item) => [item.key, item]));
  return asEntries(value).map(([mapKey, draft]) => {
    const key = mapKey || draft.key || slugify(draft.label || "item");
    const previous = existingByKey.get(key);
    return {
      ...previous,
      ...draft,
      id: draft.id || previous?.id || createId(kind),
      key,
      label: draft.label || previous?.label || labelFromKey(key),
    };
  });
}

export function normalizeSpec(input: SpecDraft | AppSpec, existing?: AppSpec): AppSpec {
  const key = input.key || existing?.key || "app";
  const stores = namedList(input.stores, "sto", existing?.stores).map((store) => ({
    id: store.id || createId("sto"),
    key: store.key || "local",
    label: store.label || labelFromKey(store.key || "local"),
    kind: store.kind === "shared" ? "shared" : "workspace",
  })) as StoreDef[];
  if (!stores.some((store) => store.key === "local")) {
    stores.push(defaultLocalStore());
  }
  const existingTypes = new Map((existing?.types ?? []).map((type) => [type.key, type]));
  const types = asEntries(input.types).map(([typeKey, draft]) => {
    const resolvedKey =
      typeKey || (draft as TypeDef).key || slugify((draft as TypeDef).label || "type");
    return normalizeType(resolvedKey, draft as TypeDraft, existingTypes.get(resolvedKey));
  });
  const spec: AppSpec = {
    version: SPEC_VERSION,
    key,
    label: input.label || existing?.label || labelFromKey(key),
    stores,
    types,
    views: namedList(input.views as never, "vw", existing?.views as never) as ViewDef[],
    forms: namedList(input.forms as never, "frm", existing?.forms as never) as FormDef[],
    flows: namedList(input.flows as never, "flw", existing?.flows as never) as FlowDef[],
    pages: namedList(input.pages as never, "pg", existing?.pages as never) as PageDef[],
  };
  for (const view of spec.views) {
    view.source = view.source || spec.types[0]?.key || "";
    view.fields = view.fields || [];
  }
  for (const form of spec.forms) {
    form.type = form.type || spec.types[0]?.key || "";
    form.fields = form.fields || [];
    form.mode = form.mode || "custom";
  }
  for (const flow of spec.flows) {
    flow.steps = flow.steps || [];
  }
  for (const page of spec.pages) {
    page.blocks = page.blocks || [];
  }
  return spec;
}

export function cloneSpec(spec: AppSpec): AppSpec {
  return structuredClone(spec);
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
  if (parsed.store) {
    return (
      spec.types.find((type) => type.key === parsed.type && type.store === parsed.store) ||
      shared?.find((type) => type.key === parsed.type && type.store === parsed.store)
    );
  }
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
      return "INTEGER";
    default:
      return "TEXT";
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
