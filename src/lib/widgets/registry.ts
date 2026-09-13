import type {
  WidgetCategory,
  WidgetDef,
  WidgetModule,
  WidgetPreview,
  WidgetPreviewModule,
  WidgetRegistrySource,
  WidgetRenderer,
} from "./types.ts";

const definitions = import.meta.glob<{ default: WidgetDef }>("./**/definition.ts", {
  eager: true,
});
const rendererModules = import.meta.glob<WidgetModule>("./**/widget.svelte");
const previewModules = import.meta.glob<WidgetPreviewModule>("./**/preview.ts");

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

const officialWidgets = entries
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
const officialRendererCache = new Map<string, Promise<WidgetRenderer | undefined>>();
const officialPreviewCache = new Map<string, Promise<WidgetPreview | undefined>>();

function loadOfficialRenderer(key: string): Promise<WidgetRenderer | undefined> {
  const cached = officialRendererCache.get(key);
  if (cached) return cached;
  const path = pathsByKey.get(key);
  const loader = path ? rendererModules[path] : undefined;
  const pending = loader?.().then((module) => module.default) ?? Promise.resolve(undefined);
  officialRendererCache.set(key, pending);
  return pending;
}

function loadOfficialPreview(key: string): Promise<WidgetPreview | undefined> {
  const cached = officialPreviewCache.get(key);
  if (cached) return cached;
  const path = pathsByKey.get(key)?.replace(/widget\.svelte$/, "preview.ts");
  const loader = path ? previewModules[path] : undefined;
  const pending = loader?.().then((module) => module.default) ?? Promise.resolve(undefined);
  officialPreviewCache.set(key, pending);
  return pending;
}

/** The built-in catalog. Future trusted catalogs can implement this contract after installation. */
export const officialWidgetRegistry: WidgetRegistrySource = {
  key: "official",
  label: "Official",
  description: "Widgets designed and maintained by builder.run.",
  kind: "bundled",
  widgets: officialWidgets,
  loadRenderer: loadOfficialRenderer,
  loadPreview: loadOfficialPreview,
};

/** Catalogs currently available to this build. Remote code is never loaded from this list. */
export const widgetRegistrySources: readonly WidgetRegistrySource[] = [officialWidgetRegistry];

export const widgets = widgetRegistrySources
  .flatMap((source) => source.widgets)
  .sort(
    (left, right) =>
      (categoryOrder.get(left.category) ?? 99) - (categoryOrder.get(right.category) ?? 99) ||
      (left.order ?? 999) - (right.order ?? 999) ||
      left.label.localeCompare(right.label),
  );

const sourceByWidgetKey = new Map(
  widgetRegistrySources.flatMap((source) =>
    source.widgets.map((widget) => [widget.key, source] as const),
  ),
);

export function loadWidgetRenderer(key: string): Promise<WidgetRenderer | undefined> {
  return sourceByWidgetKey.get(key)?.loadRenderer(key) ?? Promise.resolve(undefined);
}

export function preloadWidgetRenderer(key: string): void {
  void loadWidgetRenderer(key);
}

export function loadWidgetPreview(key: string): Promise<WidgetPreview | undefined> {
  return sourceByWidgetKey.get(key)?.loadPreview(key) ?? Promise.resolve(undefined);
}

export function preloadWidget(key: string): void {
  preloadWidgetRenderer(key);
  void loadWidgetPreview(key);
}
