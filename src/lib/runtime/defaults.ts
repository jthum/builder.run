import { createId, labelFromKey } from "./ids.ts";
import type { AppSpec, FormDef, PageDef, TypeDef, ViewDef } from "./model.ts";
import { firstViewKey, normalizeBlock } from "./widgets.ts";

export function implicitViewKey(typeKey: string): string {
  return `${typeKey}_list`;
}

export function implicitCreateFormKey(typeKey: string): string {
  return `${typeKey}_create`;
}

export function implicitEditFormKey(typeKey: string): string {
  return `${typeKey}_edit`;
}

export function implicitPageKey(typeKey: string): string {
  return `${typeKey}_page`;
}

function defaultViewFields(type: TypeDef): string[] {
  const fields = type.fields.map((field) =>
    field.type === "reference" ? `${field.key}.${guessLabelField(field.target || "")}` : field.key,
  );
  return fields.slice(0, 6);
}

function guessLabelField(target: string): string {
  const typeKey = target.includes(".") ? target.split(".").at(-1) : target;
  return typeKey ? "name" : "name";
}

export function defaultViewFor(type: TypeDef): ViewDef {
  return {
    id: createId("vw"),
    key: implicitViewKey(type.key),
    label: labelFromKey(type.key),
    source: type.key,
    fields: defaultViewFields(type),
    order_by: { updated_at: "desc" },
    implicit: true,
  };
}

export function defaultFormsFor(type: TypeDef): FormDef[] {
  const fields = type.fields.map((field) => field.key);
  return [
    {
      id: createId("frm"),
      key: implicitCreateFormKey(type.key),
      label: `New ${type.label}`,
      type: type.key,
      fields,
      mode: "create",
      implicit: true,
    },
    {
      id: createId("frm"),
      key: implicitEditFormKey(type.key),
      label: `Edit ${type.label}`,
      type: type.key,
      fields,
      mode: "edit",
      implicit: true,
    },
  ];
}

export function defaultPageFor(type: TypeDef): PageDef {
  return {
    id: createId("pg"),
    key: implicitPageKey(type.key),
    label: type.label,
    path: `/t/${type.key}`,
    blocks: [
      {
        kind: "group",
        columns: 1,
        blocks: [{ kind: "widget", widget: "table", values: { view: implicitViewKey(type.key) } }],
      },
    ],
    implicit: true,
  };
}

export function applyDefaults(spec: AppSpec): AppSpec {
  const next: AppSpec = structuredClone(spec);
  for (const type of next.types) {
    if (
      !next.views.some(
        (view) =>
          view.key === implicitViewKey(type.key) || (view.implicit && view.source === type.key),
      )
    ) {
      next.views.push(defaultViewFor(type));
    }
    if (!next.forms.some((form) => form.key === implicitCreateFormKey(type.key))) {
      next.forms.push(...defaultFormsFor(type).filter((form) => form.mode === "create"));
    }
    if (!next.forms.some((form) => form.key === implicitEditFormKey(type.key))) {
      next.forms.push(...defaultFormsFor(type).filter((form) => form.mode === "edit"));
    }
    if (!next.pages.some((page) => page.key === implicitPageKey(type.key))) {
      next.pages.push(defaultPageFor(type));
    }
  }
  next.views = next.views.filter(
    (view) => !view.implicit || next.types.some((type) => type.key === view.source),
  );
  next.forms = next.forms.filter(
    (form) => !form.implicit || next.types.some((type) => type.key === form.type),
  );
  for (const page of next.pages) {
    page.blocks = (page.blocks ?? []).map(normalizeBlock);
  }
  next.pages = next.pages.filter((page) => {
    if (!page.implicit) return true;
    const viewKey = firstViewKey(page.blocks);
    if (!viewKey) return true;
    return next.views.some((view) => view.key === viewKey);
  });
  return next;
}

export function effectiveSpec(spec: AppSpec): AppSpec {
  return applyDefaults(spec);
}
