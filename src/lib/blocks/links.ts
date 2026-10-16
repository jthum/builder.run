import type { ViewDraft } from "./presentation.ts";

/** Links and image sources support app-relative paths and explicit web URLs. */
export function webHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const href = value.trim();
  // eslint-disable-next-line no-control-regex -- URL parsing silently strips some control characters.
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href)) return undefined;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Aggregate results and rows without an explicit identity are not record links. */
export function recordHref(view: ViewDraft, row: Record<string, unknown>): string | undefined {
  return !view.group_by && typeof row.id === "string" && row.id
    ? `/t/${encodeURIComponent(view.source)}/${encodeURIComponent(row.id)}`
    : undefined;
}
