import type {
  AppSpec,
  FieldCondition,
  FilterClause,
  PageLayoutNode,
  TypeDef,
  WorkflowDef,
  WorkflowStep,
} from "./model.ts";
import { cloneSpec } from "./model.ts";
import type { AutomationEffectCall, AutomationValue } from "./automation/model.ts";
import { blockByKey, blockInputs } from "./blocks.ts";

export interface SpecReference {
  owner: "type" | "view" | "form" | "workflow" | "page";
  key: string;
  path: string;
  description: string;
}

interface FieldWalk {
  type: string;
  field: string;
  replacement?: string;
  references: SpecReference[];
}

/** Find authored references to one field. The returned list is derived, never persisted. */
export function findFieldReferences(
  spec: AppSpec,
  typeKey: string,
  fieldKey: string,
): SpecReference[] {
  const walk: FieldWalk = { type: typeKey, field: fieldKey, references: [] };
  walkFieldReferences(cloneSpec(spec), walk);
  return walk.references;
}

/** Rewrite every supported authored reference to a field and return a fresh spec. */
export function rewriteFieldReferences(
  spec: AppSpec,
  typeKey: string,
  from: string,
  to: string,
): AppSpec {
  const next = cloneSpec(spec);
  walkFieldReferences(next, { type: typeKey, field: from, replacement: to, references: [] });
  return next;
}

/** Find authored references to a type outside the type definition itself. */
export function findTypeReferences(spec: AppSpec, typeKey: string): SpecReference[] {
  const references: SpecReference[] = [];
  const add = (owner: SpecReference["owner"], key: string, path: string, description: string) =>
    references.push({ owner, key, path, description });

  for (const type of spec.types) {
    for (const field of type.fields) {
      if (field.type === "reference" && referencedType(field.target) === typeKey) {
        add(
          "type",
          type.key,
          `types.${type.key}.fields.${field.key}.target`,
          `${type.label}.${field.label}`,
        );
      }
    }
  }
  for (const view of spec.views) {
    if (view.source === typeKey) {
      add("view", view.key, `views.${view.key}.source`, `View “${view.label}”`);
    }
  }
  for (const form of spec.forms) {
    if (form.type === typeKey) {
      add("form", form.key, `forms.${form.key}.type`, `Form “${form.label}”`);
    }
    for (const input of form.inputs ?? []) {
      if (input.type === "reference" && referencedType(input.target) === typeKey) {
        add(
          "form",
          form.key,
          `forms.${form.key}.inputs.${input.key}.target`,
          `Form “${form.label}” input “${input.label}”`,
        );
      }
    }
  }
  for (const workflow of spec.workflows) {
    for (const [name, input] of Object.entries(workflow.input ?? {})) {
      if ("record" in input && input.record === typeKey) {
        add(
          "workflow",
          workflow.key,
          `workflows.${workflow.key}.input.${name}`,
          `Workflow “${workflow.label}” input “${name}”`,
        );
      }
    }
    if (workflow.trigger?.key.startsWith(`${typeKey}.`)) {
      add(
        "workflow",
        workflow.key,
        `workflows.${workflow.key}.trigger.key`,
        `Workflow “${workflow.label}” trigger`,
      );
    }
    visitEffects(workflow.steps, (effect, path) => {
      if (
        (effect.key === "records.create" || effect.key === "records.query") &&
        effect.params?.type === typeKey
      ) {
        add(
          "workflow",
          workflow.key,
          `workflows.${workflow.key}.${path}.params.type`,
          `Workflow “${workflow.label}” record step`,
        );
      }
      if (
        effect.key === "records.query" &&
        typeof effect.params?.view === "string" &&
        sourceTypeForView(spec, effect.params.view) === typeKey
      ) {
        add(
          "workflow",
          workflow.key,
          `workflows.${workflow.key}.${path}.params.view`,
          `Workflow “${workflow.label}” view query`,
        );
      }
    });
  }
  for (const page of spec.pages) {
    visitPageBlocks(page.blocks, (block, path) => {
      const view = typeof block.config?.view === "string" ? block.config.view : undefined;
      const form = typeof block.config?.form === "string" ? block.config.form : undefined;
      if (view && sourceTypeForView(spec, view) === typeKey) {
        add("page", page.key, `pages.${page.key}.${path}.config.view`, `Page “${page.label}” view`);
      }
      if (form && sourceTypeForForm(spec, form) === typeKey) {
        add("page", page.key, `pages.${page.key}.${path}.config.form`, `Page “${page.label}” form`);
      }
    });
  }
  return references;
}

/** Rewrite supported authored references after a type key changes. */
export function rewriteTypeReferences(spec: AppSpec, from: string, to: string): AppSpec {
  const next = cloneSpec(spec);
  const generatedView = !next.views.some((view) => view.key === `${from}_list`);
  const generatedCreateForm = !next.forms.some((form) => form.key === `${from}_create`);
  const generatedEditForm = !next.forms.some((form) => form.key === `${from}_edit`);
  for (const type of next.types) {
    for (const field of type.fields) {
      if (field.type === "reference" && referencedType(field.target) === from) {
        field.target = replaceReferencedType(field.target, to);
      }
    }
  }
  for (const view of next.views) {
    if (view.source === from) view.source = to;
  }
  for (const form of next.forms) {
    if (form.type === from) form.type = to;
    for (const input of form.inputs ?? []) {
      if (input.type === "reference" && referencedType(input.target) === from) {
        input.target = replaceReferencedType(input.target, to);
      }
    }
  }
  for (const workflow of next.workflows) {
    for (const input of Object.values(workflow.input ?? {})) {
      if ("record" in input && input.record === from) input.record = to;
    }
    if (workflow.trigger?.key.startsWith(`${from}.`)) {
      workflow.trigger.key = `${to}.${workflow.trigger.key.slice(from.length + 1)}`;
    }
    visitEffects(workflow.steps, (effect) => {
      if (
        (effect.key === "records.create" || effect.key === "records.query") &&
        effect.params?.type === from
      ) {
        effect.params.type = to;
      }
      if (
        generatedView &&
        effect.key === "records.query" &&
        effect.params?.view === `${from}_list`
      ) {
        effect.params.view = `${to}_list`;
      }
    });
  }
  for (const page of next.pages) {
    visitPageBlocks(page.blocks, (block) => {
      if (generatedView && block.config?.view === `${from}_list`) {
        block.config.view = `${to}_list`;
      }
      if (generatedCreateForm && block.config?.form === `${from}_create`) {
        block.config.form = `${to}_create`;
      }
      if (generatedEditForm && block.config?.form === `${from}_edit`) {
        block.config.form = `${to}_edit`;
      }
    });
  }
  return next;
}

function walkFieldReferences(spec: AppSpec, walk: FieldWalk): void {
  const types = new Map(spec.types.map((type) => [type.key, type]));
  const target = types.get(walk.type);
  if (target) walkType(target, walk);

  for (const view of spec.views) {
    const owner = ownerFor("view", view.key, view.label);
    view.fields = view.fields.map((path, index) =>
      fieldPath(spec, view.source, path, walk, owner, `fields[${index}]`, "column"),
    );
    view.where = mapWhere(view.where, (path) =>
      fieldPath(spec, view.source, path, walk, owner, "where", "filter"),
    );
    if (view.group_by) {
      view.group_by = fieldPath(
        spec,
        view.source,
        view.group_by,
        walk,
        owner,
        "group_by",
        "grouping",
      );
    }
    if (view.order_by) {
      view.order_by = mapKeys(view.order_by, (path) =>
        fieldPath(spec, view.source, path, walk, owner, "order_by", "sort"),
      );
    }
    for (const [measureKey, measure] of Object.entries(view.measures ?? {})) {
      if (measure.field) {
        measure.field = fieldPath(
          spec,
          view.source,
          measure.field,
          walk,
          owner,
          `measures.${measureKey}.field`,
          "measure",
        );
      }
      if (measure.fields) {
        measure.fields = measure.fields.map((path, index) =>
          fieldPath(
            spec,
            view.source,
            path,
            walk,
            owner,
            `measures.${measureKey}.fields[${index}]`,
            "measure",
          ),
        );
      }
    }
  }

  for (const form of spec.forms) {
    if (form.type !== walk.type) continue;
    const owner = ownerFor("form", form.key, form.label);
    form.fields = (form.fields ?? []).map((field, index) => {
      if (field !== walk.field) return field;
      addFieldReference(walk, owner, `fields[${index}]`, "field");
      return walk.replacement ?? field;
    });
  }

  for (const workflow of spec.workflows) walkWorkflow(spec, workflow, walk);
  for (const page of spec.pages) walkPage(spec, page.key, page.label, page.blocks, walk);
}

function walkType(type: TypeDef, walk: FieldWalk): void {
  const owner = ownerFor("type", type.key, type.label);
  if (type.lifecycle?.field === walk.field) {
    addFieldReference(walk, owner, "lifecycle.field", "lifecycle field");
    if (walk.replacement) type.lifecycle.field = walk.replacement;
  }
  for (const field of type.fields) {
    for (const property of ["visible_when", "enabled_when", "required_when"] as const) {
      if (!field[property]) continue;
      field[property] = mapCondition(field[property], (name) => {
        if (name !== walk.field) return name;
        addFieldReference(walk, owner, `fields.${field.key}.${property}`, "field condition");
        return walk.replacement ?? name;
      });
    }
  }
}

function walkPage(
  spec: AppSpec,
  pageKey: string,
  pageLabel: string,
  blocks: PageLayoutNode[],
  walk: FieldWalk,
  prefix = "blocks",
): void {
  const owner = ownerFor("page", pageKey, pageLabel);
  blocks.forEach((block, index) => {
    const path = `${prefix}[${index}]`;
    if (block.kind === "group") {
      walkPage(spec, pageKey, pageLabel, block.blocks, walk, `${path}.blocks`);
      return;
    }
    const definition = blockByKey(block.block);
    if (!definition || !block.config) return;
    for (const input of blockInputs(definition).filter((item) => item.type === "field")) {
      const sourceValue = block.config[input.source ?? "view"];
      const sourceKey = typeof sourceValue === "string" ? sourceValue : "";
      const source = sourceTypeForView(spec, sourceKey);
      if (!source || typeof block.config[input.key] !== "string") continue;
      block.config[input.key] = fieldPath(
        spec,
        source,
        String(block.config[input.key]),
        walk,
        owner,
        `${path}.config.${input.key}`,
        "block field",
      );
    }
  });
}

function walkWorkflow(spec: AppSpec, workflow: WorkflowDef, walk: FieldWalk): void {
  const owner = ownerFor("workflow", workflow.key, workflow.label);
  const recordInputs = new Map(
    Object.entries(workflow.input ?? {}).flatMap(([name, input]) =>
      "record" in input ? [[name, input.record] as const] : [],
    ),
  );
  collectRecordBindings(spec, workflow.steps, recordInputs);
  const trigger = workflow.trigger?.key;
  if (trigger === `${walk.type}.${walk.field}.changed`) {
    addFieldReference(walk, owner, "trigger.key", "trigger");
    if (walk.replacement) workflow.trigger!.key = `${walk.type}.${walk.replacement}.changed`;
  }

  mapStepValues(workflow.steps, (value, path) => {
    if (typeof value !== "string") return value;
    if (!path.endsWith(".$ref") && !path.endsWith(".path")) return value;
    const parts = value.split(".");
    if (parts[0] !== "vars" || !recordInputs.has(parts[1] ?? "")) return value;
    const inputType = recordInputs.get(parts[1] ?? "");
    if (inputType !== walk.type || parts[2] !== walk.field) return value;
    addFieldReference(walk, owner, path, "record binding");
    if (walk.replacement) parts[2] = walk.replacement;
    return parts.join(".");
  });

  visitEffects(workflow.steps, (effect, path) => {
    const params = effect.params;
    if (!params) return;
    const sourceType = effectSourceType(spec, params, recordInputs);
    if (sourceType !== walk.type) return;
    if (effect.key === "records.create" && isValueRecord(params.fields)) {
      params.fields = mapFieldValueKeys(params.fields, walk, owner, `${path}.params.fields`);
    }
    if (effect.key === "records.set" && isValueRecord(params.values)) {
      params.values = mapFieldValueKeys(params.values, walk, owner, `${path}.params.values`);
    }
    if (effect.key === "records.query") {
      params.where = mapWhere(params.where as never, (field) => {
        if (field !== walk.field) return field;
        addFieldReference(walk, owner, `${path}.params.where`, "record filter");
        return walk.replacement ?? field;
      }) as AutomationValue;
    }
  });
}

function fieldPath(
  spec: AppSpec,
  sourceType: string,
  path: string,
  walk: FieldWalk,
  owner: Pick<SpecReference, "owner" | "key" | "description">,
  location: string,
  role: string,
): string {
  const parts = path.split(".");
  let current = spec.types.find((type) => type.key === sourceType);
  let changed = false;
  for (let index = 0; current && index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    const field = current.fields.find((item) => item.key === part);
    if (current.key === walk.type && part === walk.field) {
      addFieldReference(walk, owner, location, role);
      if (walk.replacement) {
        parts[index] = walk.replacement;
        changed = true;
      }
    }
    current = field?.type === "reference" ? findReferencedType(spec, field.target) : undefined;
  }
  return changed ? parts.join(".") : path;
}

function effectSourceType(
  spec: AppSpec,
  params: Record<string, AutomationValue>,
  recordInputs: ReadonlyMap<string, string>,
): string | undefined {
  if (typeof params.type === "string") return params.type;
  if (typeof params.view === "string") {
    return sourceTypeForView(spec, params.view);
  }
  if (isValueRecord(params.record) && typeof params.record.$ref === "string") {
    const match = /^vars\.([^.]+)(?:\.|$)/.exec(params.record.$ref);
    if (match) return recordInputs.get(match[1] ?? "");
  }
  return undefined;
}

function sourceTypeForView(spec: AppSpec, viewKey: string): string | undefined {
  return (
    spec.views.find((view) => view.key === viewKey)?.source ??
    spec.types.find((type) => `${type.key}_list` === viewKey)?.key
  );
}

function sourceTypeForForm(spec: AppSpec, formKey: string): string | undefined {
  return (
    spec.forms.find((form) => form.key === formKey)?.type ??
    spec.types.find((type) => `${type.key}_create` === formKey || `${type.key}_edit` === formKey)
      ?.key
  );
}

function collectRecordBindings(
  spec: AppSpec,
  steps: WorkflowStep[],
  bindings: Map<string, string>,
): void {
  for (const step of steps) {
    if ("compute" in step) {
      for (const [name, value] of Object.entries(step.compute.assign)) {
        const source = bindingName(value);
        if (source && bindings.has(source)) bindings.set(name, bindings.get(source)!);
      }
    }
    if ("effect" in step && step.effect.as) {
      const type = effectSourceType(spec, step.effect.params ?? {}, bindings);
      if (type && (step.effect.key === "records.create" || step.effect.key === "records.query")) {
        bindings.set(step.effect.as, type);
      }
    }
    if ("gate" in step) {
      collectRecordBindings(spec, step.gate.pass ?? [], bindings);
      collectRecordBindings(spec, step.gate.fail ?? [], bindings);
    }
    if ("wait" in step) {
      collectRecordBindings(spec, step.wait.on_signal ?? [], bindings);
      collectRecordBindings(spec, step.wait.on_timeout ?? [], bindings);
    }
    if ("foreach" in step) {
      const source = bindingName(step.foreach.source);
      if (source && bindings.has(source)) {
        bindings.set(step.foreach.as ?? "item", bindings.get(source)!);
      }
      collectRecordBindings(spec, step.foreach.steps, bindings);
    }
    if ("repeat" in step) collectRecordBindings(spec, step.repeat.steps, bindings);
    if ("parallel" in step) {
      for (const branch of step.parallel.branches) {
        collectRecordBindings(spec, branch.steps, bindings);
      }
    }
  }
}

function bindingName(value: AutomationValue): string | undefined {
  if (!isValueRecord(value) || typeof value.$ref !== "string") return undefined;
  return /^vars\.([^.]+)(?:\.|$)/.exec(value.$ref)?.[1];
}

function mapFieldValueKeys(
  values: Record<string, AutomationValue>,
  walk: FieldWalk,
  owner: Pick<SpecReference, "owner" | "key" | "description">,
  path: string,
): Record<string, AutomationValue> {
  return mapKeys(values, (key) => {
    if (key !== walk.field) return key;
    addFieldReference(walk, owner, path, "record values");
    return walk.replacement ?? key;
  });
}

function mapWhere(
  where: FilterClause[] | Record<string, unknown> | undefined,
  map: (field: string) => string,
): FilterClause[] | Record<string, unknown> | undefined {
  if (!where) return where;
  if (Array.isArray(where)) return where.map((clause) => ({ ...clause, field: map(clause.field) }));
  return mapKeys(where, map);
}

function mapCondition(condition: FieldCondition, map: (field: string) => string): FieldCondition {
  if ("all" in condition) return { all: condition.all.map((item) => mapCondition(item, map)) };
  if ("any" in condition) return { any: condition.any.map((item) => mapCondition(item, map)) };
  if ("not" in condition) return { not: mapCondition(condition.not, map) };
  return { ...condition, field: map(condition.field) };
}

function mapKeys<T>(record: Record<string, T>, map: (key: string) => string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [map(key), value]));
}

function mapStepValues(
  steps: WorkflowStep[],
  map: (value: AutomationValue, path: string) => AutomationValue,
  prefix = "steps",
): void {
  const visit = (value: AutomationValue, path: string): AutomationValue => {
    const mapped = map(value, path);
    if (Array.isArray(mapped)) return mapped.map((item, index) => visit(item, `${path}[${index}]`));
    if (isValueRecord(mapped)) {
      return Object.fromEntries(
        Object.entries(mapped).map(([key, item]) => [key, visit(item, `${path}.${key}`)]),
      );
    }
    return mapped;
  };
  steps.forEach((step, index) => {
    const path = `${prefix}[${index}]`;
    for (const [key, value] of Object.entries(step)) {
      if (key === "id") continue;
      (step as unknown as Record<string, AutomationValue>)[key] = visit(
        value as AutomationValue,
        `${path}.${key}`,
      );
    }
  });
}

function visitEffects(
  steps: WorkflowStep[],
  visit: (effect: AutomationEffectCall, path: string) => void,
  prefix = "steps",
): void {
  steps.forEach((step, index) => {
    const path = `${prefix}[${index}]`;
    if ("effect" in step) {
      visit(step.effect, `${path}.effect`);
      if (step.effect.compensate) visit(step.effect.compensate, `${path}.effect.compensate`);
    }
    if ("gate" in step) {
      visitEffects(step.gate.pass ?? [], visit, `${path}.gate.pass`);
      visitEffects(step.gate.fail ?? [], visit, `${path}.gate.fail`);
    }
    if ("wait" in step) {
      visitEffects(step.wait.on_signal ?? [], visit, `${path}.wait.on_signal`);
      visitEffects(step.wait.on_timeout ?? [], visit, `${path}.wait.on_timeout`);
    }
    if ("foreach" in step) visitEffects(step.foreach.steps, visit, `${path}.foreach.steps`);
    if ("repeat" in step) visitEffects(step.repeat.steps, visit, `${path}.repeat.steps`);
    if ("parallel" in step) {
      step.parallel.branches.forEach((branch, branchIndex) =>
        visitEffects(branch.steps, visit, `${path}.parallel.branches[${branchIndex}].steps`),
      );
    }
  });
}

function visitPageBlocks(
  blocks: PageLayoutNode[],
  visit: (block: Extract<PageLayoutNode, { kind: "block" }>, path: string) => void,
  prefix = "blocks",
): void {
  blocks.forEach((block, index) => {
    const path = `${prefix}[${index}]`;
    if (block.kind === "group") visitPageBlocks(block.blocks, visit, `${path}.blocks`);
    else visit(block, path);
  });
}

function addFieldReference(
  walk: FieldWalk,
  owner: Pick<SpecReference, "owner" | "key" | "description">,
  path: string,
  role: string,
): void {
  walk.references.push({
    ...owner,
    path: `${owner.owner}s.${owner.key}.${path}`,
    description: `${owner.description} (${role})`,
  });
}

function ownerFor(
  owner: SpecReference["owner"],
  key: string,
  label: string,
): Pick<SpecReference, "owner" | "key" | "description"> {
  const noun = owner.charAt(0).toUpperCase() + owner.slice(1);
  return { owner, key, description: `${noun} “${label}”` };
}

function referencedType(target: string | undefined): string | undefined {
  return target?.split(".").at(-1);
}

function replaceReferencedType(target: string | undefined, replacement: string): string {
  const parts = (target ?? "").split(".");
  parts[parts.length - 1] = replacement;
  return parts.join(".");
}

function findReferencedType(spec: AppSpec, target: string | undefined): TypeDef | undefined {
  const key = referencedType(target);
  return key ? spec.types.find((type) => type.key === key) : undefined;
}

function isValueRecord(value: unknown): value is Record<string, AutomationValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
