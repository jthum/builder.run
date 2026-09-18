import { uniqueKey } from "./ids.ts";
import type { FieldDraft, FieldKind, CollectionDraft } from "$lib/blocks/presentation.ts";

export type TypeTemplateCategory = "people" | "work" | "money" | "content";

export interface TypeTemplateField {
  key: string;
  label?: string;
  type: FieldKind;
  required?: boolean;
  values?: string[];
  default?: unknown;
  target?: string;
}

export interface TypeTemplate {
  key: string;
  label: string;
  description: string;
  category: TypeTemplateCategory;
  fields: TypeTemplateField[];
}

export const typeTemplateCategories: Array<{ key: TypeTemplateCategory; label: string }> = [
  { key: "people", label: "People" },
  { key: "work", label: "Work" },
  { key: "money", label: "Money" },
  { key: "content", label: "Content" },
];

export const typeTemplates: TypeTemplate[] = [
  {
    key: "person",
    label: "Person",
    description: "Someone you work with — name, email, and a link to their organisation.",
    category: "people",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "email", type: "text" },
      { key: "phone", type: "text" },
      { key: "organisation", type: "reference", target: "organisation" },
    ],
  },
  {
    key: "organisation",
    label: "Organisation",
    description: "A company or group — name, email, and website.",
    category: "people",
    fields: [
      { key: "name", type: "text", required: true },
      { key: "email", type: "text" },
      { key: "website", type: "text" },
    ],
  },
  {
    key: "project",
    label: "Project",
    description: "Work with a status, due date, budget, and optional client.",
    category: "work",
    fields: [
      { key: "name", type: "text", required: true },
      {
        key: "status",
        type: "enum",
        values: ["planned", "active", "complete"],
        default: "planned",
      },
      { key: "due_date", type: "date" },
      { key: "budget", type: "number" },
      { key: "client", type: "reference", target: "organisation" },
    ],
  },
  {
    key: "task",
    label: "Task",
    description: "A to-do with status, due date, and a link to a project.",
    category: "work",
    fields: [
      { key: "title", type: "text", required: true },
      {
        key: "status",
        type: "enum",
        values: ["todo", "doing", "done"],
        default: "todo",
      },
      { key: "due_date", type: "date" },
      { key: "project", type: "reference", target: "project" },
    ],
  },
  {
    key: "invoice",
    label: "Invoice",
    description: "A bill with an amount, status, and a link to a project.",
    category: "money",
    fields: [
      { key: "number", type: "text", required: true },
      { key: "amount", type: "number", required: true },
      {
        key: "status",
        type: "enum",
        values: ["draft", "sent", "paid", "overdue"],
        default: "draft",
      },
      { key: "issued_on", type: "date" },
      { key: "project", type: "reference", target: "project" },
    ],
  },
  {
    key: "expense",
    label: "Expense",
    description: "Money out — title, amount, and approval status.",
    category: "money",
    fields: [
      { key: "title", type: "text", required: true },
      { key: "amount", type: "number", required: true },
      {
        key: "status",
        type: "enum",
        values: ["draft", "submitted", "approved", "rejected", "paid"],
        default: "draft",
      },
      { key: "spent_on", type: "date" },
    ],
  },
  {
    key: "note",
    label: "Note",
    description: "A titled note you can attach to other records later.",
    category: "content",
    fields: [
      { key: "title", type: "text", required: true },
      { key: "body", type: "text" },
    ],
  },
  {
    key: "event",
    label: "Event",
    description: "Something happening on a date, with a place.",
    category: "content",
    fields: [
      { key: "title", type: "text", required: true },
      { key: "date", type: "date", required: true },
      { key: "location", type: "text" },
    ],
  },
];

export function resolveFieldTarget(
  wanted: string | undefined,
  types: CollectionDraft[],
): string | undefined {
  if (!wanted) return undefined;
  const match = types.find((type) => type.key === wanted);
  if (!match) return undefined;
  return match.key;
}

export type TemplateFieldDraft = Partial<FieldDraft> & { key: string; type: FieldKind };

export function resolveTemplateFields(
  template: TypeTemplate,
  types: CollectionDraft[],
): TemplateFieldDraft[] {
  const fields: TemplateFieldDraft[] = [];
  for (const field of template.fields) {
    if (field.type === "reference") {
      const target = resolveFieldTarget(field.target, types);
      if (!target) continue;
      fields.push({
        key: field.key,
        label: field.label,
        type: "reference",
        required: field.required,
        target,
      });
      continue;
    }
    fields.push({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      values: field.values,
      default: field.default,
    });
  }
  return fields;
}

export function typeDraftFromTemplate(
  name: string,
  template: TypeTemplate | undefined,
  existing: CollectionDraft[],
): { key: string; label: string; fields: TemplateFieldDraft[] } {
  const key = uniqueKey(
    name,
    existing.map((type) => type.key),
    "type",
  );
  return {
    key,
    label: name,
    fields: template ? resolveTemplateFields(template, existing) : [],
  };
}
