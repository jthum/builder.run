import type { ViewDraft } from "@jthum/framework/svelte/studio/data";

/** Resolve a Studio-readable field path to the key emitted by its canonical View query. */
export function viewOutputKey(view: ViewDraft, field: string): string {
  if (view.group_by === field) return view.group_alias ?? semanticAlias(field);
  if (view.measures?.[field]) return field;
  return view.aliases?.[field] ?? semanticAlias(field);
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
