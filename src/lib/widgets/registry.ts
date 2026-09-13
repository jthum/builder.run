import type { WidgetCategory, WidgetDef, WidgetModule, WidgetRenderer } from "./types.ts";

const definitions = import.meta.glob<{ default: WidgetDef }>("./**/definition.ts", {
  eager: true,
});
const rendererModules = import.meta.glob<WidgetModule>("./**/widget.svelte");

const entries = Object.entries(definitions).map(([path, module]) => ({
  path,
  definition: module.default,
}));

export const widgetCategories: Array<{ key: WidgetCategory; label: string }> = [
  { key: "highlights", label: "Highlights" },
  { key: "content", label: "Content" },
  { key: "data", label: "Data" },
  { key: "charts", label: "Charts" },
  { key: "actions", label: "Actions" },
];

const categoryOrder = new Map(widgetCategories.map((category, index) => [category.key, index]));

export const widgets = entries
  .map(({ definition }) => definition)
  .sort(
    (left, right) =>
      (categoryOrder.get(left.category) ?? 99) - (categoryOrder.get(right.category) ?? 99) ||
      (left.order ?? 999) - (right.order ?? 999) ||
      left.label.localeCompare(right.label),
  );

const pathsByKey = new Map(
  entries.map(({ path, definition }) => [
    definition.key,
    path.replace(/definition\.ts$/, "widget.svelte"),
  ]),
);
const rendererCache = new Map<string, Promise<WidgetRenderer | undefined>>();

export function loadWidgetRenderer(key: string): Promise<WidgetRenderer | undefined> {
  const cached = rendererCache.get(key);
  if (cached) return cached;
  const path = pathsByKey.get(key);
  const loader = path ? rendererModules[path] : undefined;
  const pending = loader?.().then((module) => module.default) ?? Promise.resolve(undefined);
  rendererCache.set(key, pending);
  return pending;
}

export function preloadWidgetRenderer(key: string): void {
  void loadWidgetRenderer(key);
}
