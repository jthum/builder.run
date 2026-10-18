import type { AppSelection } from "$lib/framework/bootstrap.ts";

const SELECTION_KEY = "app-selection";

/** Local navigation preference, not an authentication or authorization credential. */
export function readSelection(
  storage: Pick<Storage, "getItem">,
  key = SELECTION_KEY,
): AppSelection | undefined {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "spaceId" in value &&
      "appId" in value &&
      typeof value.spaceId === "string" &&
      typeof value.appId === "string"
    )
      return { spaceId: value.spaceId, appId: value.appId };
  } catch {
    // Malformed or unavailable preferences must not prevent opening the catalog.
  }
  return undefined;
}

export function writeSelection(
  storage: Pick<Storage, "setItem">,
  selection: AppSelection,
  key = SELECTION_KEY,
): void {
  try {
    storage.setItem(key, JSON.stringify(selection));
  } catch {
    // The catalog remains usable when browser preference storage is unavailable.
  }
}
