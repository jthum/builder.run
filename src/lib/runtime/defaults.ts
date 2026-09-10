import { createSpecId, labelFromKey } from "./ids.ts";
import {
  cloneData,
  type AppSpec,
  type FormDef,
  type PageDef,
  type TypeDef,
  type ViewDef,
} from "./model.ts";
import { firstViewKey, normalizePageRows } from "./widgets.ts";

const implicitIds = new Map<string, string>();

function implicitId(type: TypeDef, role: string): string {
  const key = `${type.id}:${role}`;
  const existing = implicitIds.get(key);
  if (existing) return existing;
  const id = createSpecId();
  implicitIds.set(key, id);
  return id;
}

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

export function defaultViewFields(type: TypeDef): string[] {
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
    id: implicitId(type, "view"),
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
      id: implicitId(type, "create-form"),
      key: implicitCreateFormKey(type.key),
      label: `New ${type.label}`,
      type: type.key,
      fields,
      mode: "create",
      implicit: true,
    },
    {
      id: implicitId(type, "edit-form"),
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
    id: implicitId(type, "page"),
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

export function authoredSpec(spec: AppSpec): AppSpec {
  const authored = cloneData(spec);
  authored.views = authored.views.filter((view) => !view.implicit);
  authored.forms = authored.forms.filter((form) => !form.implicit);
  authored.pages = authored.pages.filter((page) => !page.implicit);
  return authored;
}

export function effectiveSpec(spec: AppSpec): AppSpec {
  const next = authoredSpec(spec);
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
    page.blocks = normalizePageRows(page.blocks);
  }
  next.pages = next.pages.filter((page) => {
    if (!page.implicit) return true;
    const viewKey = firstViewKey(page.blocks);
    if (!viewKey) return true;
    return next.views.some((view) => view.key === viewKey);
  });
  return next;
}
