import type { CollectionDraft } from "@jthum/framework/svelte/authoring/data";
import type { RecordProperty } from "@jthum/framework/svelte/records/data";
import { recordTitle } from "./labels.ts";
import type { SourceFilter, SourceQueryDefinition, ViewDefinition } from "@jthum/framework/spec";
import { asFrameworkError, ERROR_CODES } from "@jthum/framework/errors";

export interface RecordReference {
  label: string;
  href?: string;
}
export interface RecordPresentation {
  title: string;
  description?: string;
  statusKey?: string;
  properties: RecordProperty[];
}

/** Host defaults, not persisted layout or a second record schema. */
export function presentRecord(
  type: CollectionDraft,
  row: Record<string, unknown>,
  references: Record<string, RecordReference> = {},
): RecordPresentation {
  const titleKey = ["name", "title", "number", "email"].find((key) => Boolean(row[key]));
  const descriptionField = type.fields.find(
    (field) => field.key === "description" && field.type === "text",
  );
  const description =
    descriptionField && typeof row[descriptionField.key] === "string"
      ? String(row[descriptionField.key])
      : undefined;
  const status = type.fields.find(
    (field) => field.key === (type.lifecycle?.field ?? "status") && field.type === "enum",
  );
  const statusKey =
    status && row[status.key] != null && row[status.key] !== "" ? status.key : undefined;
  return {
    title: recordTitle(row, type),
    description,
    statusKey,
    properties: type.fields
      .filter(
        (field) =>
          field.key !== titleKey &&
          (!description || field !== descriptionField) &&
          field.key !== statusKey,
      )
      .map((field) => ({
        key: field.key,
        label: field.label,
        value:
          field.type === "reference"
            ? (references[field.key]?.label ?? (row[field.key] ? "Unavailable" : null))
            : row[field.key],
        multiline: field.type === "text" && field.presentation === "textarea",
        highlight:
          field.type === "number" &&
          field.presentation !== "rating" &&
          typeof row[field.key] === "number" &&
          Number.isFinite(row[field.key]),
      })),
  };
}

export function recordPageHref(typeKey: string, id: string): string {
  return `/t/${encodeURIComponent(typeKey)}/${encodeURIComponent(id)}`;
}

/** Keep related-record filtering in persistence and preserve the View's projection/sort. */
export function relatedRecordQuery(
  view: ViewDefinition,
  fieldId: string,
  id: string,
): SourceQueryDefinition {
  const filters: SourceFilter[] = [{ path: [fieldId], operator: "eq", value: id }];
  if (view.query?.filter) filters.push(view.query.filter);
  for (const parameter of view.parameters ?? []) {
    if (parameter.source === "context" && parameter.key === "record_id")
      filters.push({ path: parameter.path, operator: parameter.operator ?? "eq", value: id });
  }
  return { ...view.query, filter: { all: filters } };
}

export async function loadRecordDetails(
  type: CollectionDraft,
  id: string,
  getRecord: (key: string, id: string) => Promise<Record<string, unknown> | null>,
  collections: readonly CollectionDraft[],
): Promise<{
  record: Record<string, unknown> | null;
  references: Record<string, RecordReference>;
}> {
  const record = await getRecord(type.key, id);
  if (!record) return { record: null, references: {} };
  const cache = new Map<string, Promise<Record<string, unknown> | null>>();
  const entries = await Promise.all(
    type.fields
      .filter((field) => field.type === "reference")
      .map(async (field): Promise<[string, RecordReference]> => {
        const target = field.target?.split(".").at(-1);
        const value = record[field.key];
        if (!target || typeof value !== "string" || !value) return [field.key, { label: "" }];
        const key = JSON.stringify([target, value]);
        let pending = cache.get(key);
        if (!pending) {
          pending = getRecord(target, value);
          cache.set(key, pending);
        }
        try {
          const linked = await pending;
          return [
            field.key,
            linked
              ? {
                  label: recordTitle(
                    linked,
                    collections.find((item) => item.key === target),
                  ),
                  href: recordPageHref(target, value),
                }
              : { label: "Unavailable" },
          ];
        } catch (error) {
          const failure = asFrameworkError(error);
          if (
            failure.code !== ERROR_CODES.permissionDenied &&
            failure.code !== ERROR_CODES.resourceNotFound
          )
            console.warn("Linked record could not be loaded.", failure);
          // Unreadable references do not prevent opening an otherwise accessible record.
          return [field.key, { label: "Unavailable" }];
        }
      }),
  );
  return { record, references: Object.fromEntries(entries) };
}
