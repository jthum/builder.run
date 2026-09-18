import type {
  BlockCategory,
  BlockComponent,
  BlockDefinition,
  BlockModule,
  BlockPreview,
  BlockPreviewModule,
  BlockSource,
} from "./types.ts";
import { Catalog, type CatalogSource } from "@jthum/framework/catalog";

const definitions = import.meta.glob<{ default: BlockDefinition }>("./**/definition.ts", {
  eager: true,
});
const blockModules = import.meta.glob<BlockModule>("./**/block.svelte");
const previewModules = import.meta.glob<BlockPreviewModule>("./**/preview.ts");

const entries = Object.entries(definitions).map(([path, module]) => ({
  path,
  definition: module.default,
}));

export const blockCategories: Array<{ key: BlockCategory; label: string }> = [
  { key: "highlights", label: "Highlights" },
  { key: "content", label: "Content" },
  { key: "data", label: "Data" },
  { key: "charts", label: "Charts" },
  { key: "actions", label: "Actions" },
];

const categoryOrder = new Map(blockCategories.map((category, index) => [category.key, index]));

const officialBlocks = entries
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
    path.replace(/definition\.ts$/, "block.svelte"),
  ]),
);
const officialBlockCache = new Map<string, Promise<BlockComponent | undefined>>();
const officialPreviewCache = new Map<string, Promise<BlockPreview | undefined>>();

function loadOfficialBlock(key: string): Promise<BlockComponent | undefined> {
  const cached = officialBlockCache.get(key);
  if (cached) return cached;
  const path = pathsByKey.get(key);
  const loader = path ? blockModules[path] : undefined;
  const pending = loader?.().then((module) => module.default) ?? Promise.resolve(undefined);
  officialBlockCache.set(key, pending);
  return pending;
}

function loadOfficialPreview(key: string): Promise<BlockPreview | undefined> {
  const cached = officialPreviewCache.get(key);
  if (cached) return cached;
  const path = pathsByKey.get(key)?.replace(/block\.svelte$/, "preview.ts");
  const loader = path ? previewModules[path] : undefined;
  const pending = loader?.().then((module) => module.default) ?? Promise.resolve(undefined);
  officialPreviewCache.set(key, pending);
  return pending;
}

/** The built-in catalog. Future trusted catalogs can implement this contract after installation. */
export const officialBlockSource: BlockSource = {
  key: "official",
  label: "Official",
  description: "Blocks designed and maintained by builder.run.",
  kind: "bundled",
  categories: blockCategories,
  entries: officialBlocks,
  load: loadOfficialBlock,
  loadPreview: loadOfficialPreview,
};

/** Catalogs currently available to this build. Remote code is never loaded from this list. */
export const blockSources: readonly BlockSource[] = [officialBlockSource];

const blockCatalogSources: readonly CatalogSource<BlockDefinition>[] = blockSources.map(
  ({ key, label, description, categories, entries }) => ({
    key,
    label,
    description,
    categories,
    entries,
  }),
);
export const blockCatalog = new Catalog(blockCatalogSources);
const blockItems = blockCatalog.list().items;
export const blocks = blockItems
  .map(({ entry }) => entry)
  .sort(
    (left, right) =>
      (categoryOrder.get(left.category) ?? 99) - (categoryOrder.get(right.category) ?? 99) ||
      (left.order ?? 999) - (right.order ?? 999) ||
      left.label.localeCompare(right.label),
  );

const sourceByBlockKey = new Map(
  blockItems.map(
    ({ source, entry }) =>
      [entry.key, blockSources.find((candidate) => candidate.key === source.key)!] as const,
  ),
);

if (sourceByBlockKey.size !== blockItems.length)
  throw new Error("Installed Block keys must be unique across catalog sources.");

export function loadBlock(key: string): Promise<BlockComponent | undefined> {
  return sourceByBlockKey.get(key)?.load(key) ?? Promise.resolve(undefined);
}

export function preloadBlock(key: string): void {
  void loadBlock(key);
}

export function loadBlockPreview(key: string): Promise<BlockPreview | undefined> {
  return sourceByBlockKey.get(key)?.loadPreview(key) ?? Promise.resolve(undefined);
}

export function preloadBlockAssets(key: string): void {
  preloadBlock(key);
  void loadBlockPreview(key);
}
