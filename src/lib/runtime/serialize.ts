import { parse, stringify } from "yaml";
import { compactWhere, normalizeFilters } from "./filters.ts";
import { cloneSpec, normalizeSpec, type AppSpec } from "./model.ts";

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
    stores: Object.fromEntries(
      copy.stores.map((store) => [
        store.key,
        {
          id: store.id,
          label: store.label,
          kind: store.kind,
        },
      ]),
    ),
    types: Object.fromEntries(
      copy.types.map((type) => [
        type.key,
        {
          id: type.id,
          label: type.label,
          store: type.store,
          ...(type.expose ? { expose: true } : {}),
          fields: Object.fromEntries(
            type.fields.map((field) => [
              field.key,
              {
                id: field.id,
                label: field.label,
                type: field.type,
                ...(field.required ? { required: true } : {}),
                ...(field.default !== undefined ? { default: field.default } : {}),
                ...(field.values ? { values: field.values } : {}),
                ...(field.target ? { target: field.target } : {}),
                ...(field.presentation ? { presentation: field.presentation } : {}),
                ...(field.variant ? { variant: field.variant } : {}),
                ...(field.max ? { max: field.max } : {}),
                ...(field.value_semantics ? { value_semantics: field.value_semantics } : {}),
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
            type: form.type,
            fields: form.fields,
            mode: form.mode,
            ...(form.submit ? { submit: form.submit } : {}),
          },
        ]),
    ),
    flows: Object.fromEntries(
      copy.flows.map((flow) => [
        flow.key,
        {
          id: flow.id,
          label: flow.label,
          ...(flow.input ? { input: flow.input } : {}),
          ...(flow.when ? { when: flow.when } : {}),
          ...(flow.trigger ? { trigger: flow.trigger } : {}),
          ...(flow.expose ? { expose: flow.expose } : {}),
          steps: flow.steps,
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
            ...(page.path ? { path: page.path } : {}),
            ...(page.folder ? { folder: page.folder } : {}),
            ...(page.icon ? { icon: page.icon } : {}),
            blocks: page.blocks,
          },
        ]),
    ),
  };
}
