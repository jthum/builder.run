import type { CollectionDraft, ViewDraft } from "@jthum/framework/svelte/authoring/data";
import { projectionKey } from "@jthum/framework/spec";

/** Resolve a Studio-readable field path to the key emitted by its canonical View query. */
export function viewOutputKey(view: ViewDraft, field: string): string {
  return projectionKey(viewOutput(view, field));
}

function viewOutput(view: ViewDraft, field: string): string | readonly string[] {
  if (view.group_by === field) return view.group_alias ?? semanticAlias(field);
  if (view.measures?.[field]) return field;
  return view.aliases?.[field] ?? semanticAlias(field);
}

/** Identity projections support links; a selected label remains the visible column. */
export function viewDisplayFields(view: ViewDraft, collection?: CollectionDraft): string[] {
  return view.fields.filter((path) => {
    if (collection?.fields.find((field) => field.key === path)?.type !== "reference") return true;
    const output = view.aliases?.[path];
    if (typeof output === "string" || output?.at(-1) !== "id") return true;
    return !view.fields.some((other) => {
      const labelOutput = view.aliases?.[other];
      return (
        other.startsWith(`${path}.`) &&
        Array.isArray(labelOutput) &&
        labelOutput.length === output.length &&
        labelOutput.slice(0, -1).every((part, index) => part === output[index])
      );
    });
  });
}

/** Read a configured field from an explicitly projected View result. */
export function viewCellValue(
  view: ViewDraft | undefined,
  row: Record<string, unknown>,
  field: string,
): unknown {
  if (!view || !field) return undefined;
  const output = viewOutput(view, field);
  const path = typeof output === "string" ? [output] : output;
  return path.reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, key))
      return undefined;
    return (value as Record<string, unknown>)[key];
  }, row);
}

/** Link a relationship label only when its reference identity was explicitly selected. */
export function viewReferenceHref(
  view: ViewDraft,
  row: Record<string, unknown>,
  path: string,
  collections: readonly CollectionDraft[],
): string | undefined {
  const parts = path.split(".");
  let collection = collections.find((item) => item.key === view.source);
  let href: string | undefined;
  for (const [index, part] of parts.entries()) {
    const field = collection?.fields.find((item) => item.key === part);
    if (!field) return undefined;
    if (field.type !== "reference") return index === parts.length - 1 ? href : undefined;
    const id = viewCellValue(view, row, parts.slice(0, index + 1).join("."));
    const target = field.target?.split(".").at(-1);
    href =
      typeof id === "string" && id && target
        ? `/t/${encodeURIComponent(target)}/${encodeURIComponent(id)}`
        : undefined;
    collection = collections.find((item) => item.key === target);
  }
  return href;
}

function semanticAlias(path: string): string {
  return (
    path
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "value"
  );
}
