import { parse, stringify } from "yaml";
import { compactWhere, normalizeFilters } from "./filters.ts";
import {
  cloneSpec,
  normalizeSpec,
  parseTypeRef,
  type AppSpec,
  type WorkflowStep,
  type TypeDef,
} from "./model.ts";

export function sharedTypeDependencies(spec: AppSpec, sharedTypes: TypeDef[]): TypeDef[] {
  const local = new Set(spec.types.map((type) => type.key));
  const shared = new Map(sharedTypes.map((type) => [type.key, type]));
  const required = new Set<string>();
  const add = (reference: string | undefined) => {
    if (!reference) return;
    const key = parseTypeRef(reference).type;
    if (!local.has(key) && shared.has(key)) required.add(key);
  };
  const addPath = (path: string | undefined) => add(path?.split(".", 1)[0]);
  const visitSteps = (steps: WorkflowStep[]) => {
    for (const step of steps) {
      if (
        "effect" in step &&
        step.effect.key === "records.create" &&
        typeof step.effect.params?.type === "string"
      )
        add(step.effect.params.type);
      else if ("effect" in step && step.effect.key === "records.query")
        add(typeof step.effect.params?.type === "string" ? step.effect.params.type : undefined);
      else if ("gate" in step) {
        visitSteps(step.gate.pass ?? []);
        visitSteps(step.gate.fail ?? []);
      } else if ("foreach" in step) visitSteps(step.foreach.steps);
      else if ("repeat" in step) visitSteps(step.repeat.steps);
      else if ("parallel" in step)
        step.parallel.branches.forEach((branch) => visitSteps(branch.steps));
      else if ("wait" in step) {
        visitSteps(step.wait.on_signal ?? []);
        visitSteps(step.wait.on_timeout ?? []);
      }
    }
  };

  for (const type of spec.types) {
    for (const field of type.fields) add(field.target);
  }
  for (const view of spec.views) add(view.source);
  for (const form of spec.forms) {
    add(form.type);
    for (const input of form.inputs ?? []) add(input.target);
  }
  for (const workflow of spec.workflows) {
    for (const input of Object.values(workflow.input ?? {}))
      if ("record" in input) add(input.record);
    addPath(workflow.trigger?.key);
    visitSteps(workflow.steps);
  }
  return sharedTypes.filter((type) => required.has(type.key));
}

export function specToJson(spec: AppSpec): string {
  return JSON.stringify(authoringSpec(spec), null, 2);
}

export function specToYaml(spec: AppSpec): string {
  return stringify(authoringSpec(spec));
}

export function specFromText(text: string): AppSpec {
  const trimmed = text.trim();
  if (!trimmed) return normalizeSpec({});
  const raw =
    trimmed.startsWith("{") || trimmed.startsWith("[") ? JSON.parse(trimmed) : parse(trimmed);
  return normalizeSpec(raw ?? {});
}

export function authoringSpec(spec: AppSpec): Record<string, unknown> {
  const copy = cloneSpec(spec);
  return {
    version: copy.version,
    key: copy.key,
    label: copy.label,
    ...(copy.meta ? { meta: copy.meta } : {}),
    stores: Object.fromEntries(
      copy.stores.map((store) => [
        store.key,
        {
          id: store.id,
          label: store.label,
          kind: store.kind,
          ...(store.meta ? { meta: store.meta } : {}),
        },
      ]),
    ),
    types: Object.fromEntries(
      copy.types.map((type) => [
        type.key,
        {
          id: type.id,
          label: type.label,
          ...(type.meta ? { meta: type.meta } : {}),
          ...(type.collection_label ? { collection_label: type.collection_label } : {}),
          store: type.store,
          ...(type.expose ? { expose: true } : {}),
          ...(type.lifecycle ? { lifecycle: type.lifecycle } : {}),
          fields: Object.fromEntries(
            type.fields.map((field) => [
              field.key,
              {
                id: field.id,
                label: field.label,
                type: field.type,
                ...(field.meta ? { meta: field.meta } : {}),
                ...(field.description ? { description: field.description } : {}),
                ...(field.placeholder ? { placeholder: field.placeholder } : {}),
                ...(field.required ? { required: true } : {}),
                ...(field.default !== undefined ? { default: field.default } : {}),
                ...(field.values ? { values: field.values } : {}),
                ...(field.target ? { target: field.target } : {}),
                ...(field.format ? { format: field.format } : {}),
                ...(field.currency ? { currency: field.currency } : {}),
                ...(field.presentation ? { presentation: field.presentation } : {}),
                ...(field.variant ? { variant: field.variant } : {}),
                ...(field.max ? { max: field.max } : {}),
                ...(field.value_semantics ? { value_semantics: field.value_semantics } : {}),
                ...(field.validation ? { validation: field.validation } : {}),
                ...(field.visible_when ? { visible_when: field.visible_when } : {}),
                ...(field.enabled_when ? { enabled_when: field.enabled_when } : {}),
                ...(field.required_when ? { required_when: field.required_when } : {}),
                ...(field.hidden_value === "clear" ? { hidden_value: "clear" } : {}),
              },
            ]),
          ),
        },
      ]),
    ),
    views: Object.fromEntries(
      copy.views
        .filter((view) => !view.implicit)
        .map((view) => [
          view.key,
          {
            id: view.id,
            label: view.label,
            ...(view.meta ? { meta: view.meta } : {}),
            source: view.source,
            fields: view.fields,
            ...(view.where
              ? { where: compactWhere(normalizeFilters(view.where)) ?? view.where }
              : {}),
            ...(view.expose?.length ? { expose: view.expose } : {}),
            ...(view.limit ? { limit: view.limit } : {}),
            ...(view.order_by ? { order_by: view.order_by } : {}),
            ...(view.group_by ? { group_by: view.group_by } : {}),
            ...(view.measures ? { measures: view.measures } : {}),
          },
        ]),
    ),
    forms: Object.fromEntries(
      copy.forms
        .filter((form) => !form.implicit)
        .map((form) => [
          form.key,
          {
            id: form.id,
            label: form.label,
            ...(form.meta ? { meta: form.meta } : {}),
            mode: form.mode,
            ...(form.type ? { type: form.type } : {}),
            ...(form.fields ? { fields: form.fields } : {}),
            ...(form.inputs
              ? {
                  inputs: Object.fromEntries(
                    form.inputs.map((input) => [
                      input.key,
                      {
                        id: input.id,
                        label: input.label,
                        ...(input.meta ? { meta: input.meta } : {}),
                        type: input.type,
                        ...(input.description ? { description: input.description } : {}),
                        ...(input.placeholder ? { placeholder: input.placeholder } : {}),
                        ...(input.required ? { required: true } : {}),
                        ...(input.default !== undefined ? { default: input.default } : {}),
                        ...(input.values ? { values: input.values } : {}),
                        ...(input.target ? { target: input.target } : {}),
                        ...(input.format ? { format: input.format } : {}),
                        ...(input.currency ? { currency: input.currency } : {}),
                        ...(input.presentation ? { presentation: input.presentation } : {}),
                        ...(input.variant ? { variant: input.variant } : {}),
                        ...(input.max !== undefined ? { max: input.max } : {}),
                        ...(input.value_semantics
                          ? { value_semantics: input.value_semantics }
                          : {}),
                        ...(input.validation ? { validation: input.validation } : {}),
                        ...(input.visible_when ? { visible_when: input.visible_when } : {}),
                        ...(input.enabled_when ? { enabled_when: input.enabled_when } : {}),
                        ...(input.required_when ? { required_when: input.required_when } : {}),
                        ...(input.hidden_value ? { hidden_value: input.hidden_value } : {}),
                      },
                    ]),
                  ),
                }
              : {}),
            ...(form.submit ? { submit: form.submit } : {}),
          },
        ]),
    ),
    workflows: Object.fromEntries(
      copy.workflows.map((workflow) => [
        workflow.key,
        {
          id: workflow.id,
          label: workflow.label,
          ...(workflow.meta ? { meta: workflow.meta } : {}),
          ...(workflow.description ? { description: workflow.description } : {}),
          ...(workflow.enabled === false ? { enabled: false } : {}),
          ...(workflow.priority ? { priority: workflow.priority } : {}),
          ...(workflow.input ? { input: workflow.input } : {}),
          ...(workflow.trigger ? { trigger: workflow.trigger } : {}),
          ...(workflow.expose ? { expose: workflow.expose } : {}),
          steps: workflow.steps,
        },
      ]),
    ),
    pages: Object.fromEntries(
      copy.pages
        .filter((page) => !page.implicit)
        .map((page) => [
          page.key,
          {
            id: page.id,
            label: page.label,
            ...(page.meta ? { meta: page.meta } : {}),
            ...(page.path ? { path: page.path } : {}),
            ...(page.folder ? { folder: page.folder } : {}),
            ...(page.icon ? { icon: page.icon } : {}),
            blocks: page.blocks,
          },
        ]),
    ),
  };
}
