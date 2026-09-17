import { columnLabel, homeViews, isBlankApp } from "$lib/app/labels.ts";
import { blockCategories, blocks } from "$lib/blocks/registry.ts";
import type {
  BlockCategory,
  BlockDefinition,
  BlockFieldKind,
  BlockInput,
  BlockInputType,
} from "$lib/blocks/types.ts";
import type {
  AppSpec,
  FieldDef,
  PageLayoutNode,
  PageDef,
  PageRowHeight,
  TypeDef,
} from "./model.ts";
import { createSpecId, isSpecId, labelFromKey } from "./ids.ts";

export const HOME_PAGE_KEY = "home";
export { blockCategories, blocks };
export type { BlockCategory, BlockDefinition, BlockFieldKind, BlockInput, BlockInputType };

export function blockByKey(key: string): BlockDefinition | undefined {
  return blocks.find((item) => item.key === key);
}

const BLOCK_TITLE_INPUT: BlockInput = {
  key: "title",
  label: "Title",
  type: "text",
  description: "Optional block title. Omit it to use the selected View or Form name.",
};

/** Effective inputs shared by the UI, agent discovery, defaults, and validation. */
export function blockInputs(block: BlockDefinition): readonly BlockInput[] {
  return block.inputs.some((input) => input.type === "view" || input.type === "form")
    ? [BLOCK_TITLE_INPUT, ...block.inputs]
    : block.inputs;
}

export interface BlockOption {
  value: string;
  label: string;
}

export function blockInputOptions(
  spec: AppSpec,
  input: BlockInput,
  config: Record<string, unknown>,
): BlockOption[] {
  if (input.type === "view") {
    return spec.views.map((view) => ({ value: view.key, label: view.label }));
  }
  if (input.type === "form") {
    return spec.forms.map((form) => ({ value: form.key, label: form.label }));
  }
  if (input.type === "rule") {
    return spec.workflows
      .filter((workflow) => workflow.expose?.includes("ui") && !workflow.trigger)
      .map((workflow) => ({ value: workflow.key, label: workflow.label }));
  }
  if (input.type === "select") return [...(input.options ?? [])];
  if (input.type !== "field") return [];
  const dependency = input.dependsOn ?? "view";
  const viewKey = typeof config[dependency] === "string" ? config[dependency] : "";
  return fieldsMatching(fieldsForView(spec, viewKey), input.fieldKind).map((field) => ({
    value: field.key,
    label: field.label,
  }));
}

export function describeBlock(
  spec: AppSpec,
  key: string,
  config: Record<string, unknown> = {},
): Record<string, unknown> {
  const block = blockByKey(key);
  if (!block) {
    return { error: `Unknown block "${key}"`, blocks: blocks.map((item) => item.key) };
  }
  return {
    key: block.key,
    label: block.label,
    description: block.description,
    category: block.category,
    inputs: blockInputs(block).map((input) => ({
      key: input.key,
      label: input.label,
      type: input.type,
      ...(input.description ? { description: input.description } : {}),
      ...(input.required ? { required: true } : {}),
      ...(input.default !== undefined ? { default: input.default } : {}),
      ...(input.fieldKind ? { fieldKind: input.fieldKind } : {}),
      ...(input.dependsOn ? { dependsOn: input.dependsOn } : {}),
      ...(["view", "form", "rule", "field", "select"].includes(input.type)
        ? { options: blockInputOptions(spec, input, config) }
        : {}),
    })),
  };
}

function configuredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionValues(options: BlockOption[]): string {
  return options.length ? options.map((option) => option.value).join(", ") : "none";
}

/** Validate and safely complete a block's config from its registry definition. */
export function configureBlockConfig(
  spec: AppSpec,
  block: BlockDefinition,
  supplied: Record<string, unknown> = {},
): Record<string, unknown> {
  const inputs = blockInputs(block);
  const allowed = new Set(inputs.map((input) => input.key));
  const unknown = Object.keys(supplied).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(
      `Block "${block.key}" does not accept config.${unknown[0]}. Valid inputs: ${[...allowed].join(", ")}`,
    );
  }
  const config = { ...supplied };
  for (const input of inputs) {
    let value = config[input.key];
    let present = value !== undefined && value !== null && value !== "";
    const options = blockInputOptions(spec, input, config);
    if (!present && input.required && input.default !== undefined) {
      value = input.default;
      config[input.key] = value;
      present = true;
    }
    if (!present && input.required && options.length === 1) {
      value = options[0]?.value;
      config[input.key] = value;
      present = true;
    }
    if (!present) {
      if (input.required) {
        const choices = options.length ? ` Valid options: ${optionValues(options)}.` : "";
        throw new Error(`Block "${block.key}" requires config.${input.key}.${choices}`);
      }
      continue;
    }
    if ((input.type === "text" || input.type === "textarea") && typeof value !== "string") {
      throw new Error(`Block "${block.key}" config.${input.key} must be text`);
    }
    if (input.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`Block "${block.key}" config.${input.key} must be a finite number`);
    }
    if (input.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Block "${block.key}" config.${input.key} must be true or false`);
    }
    if (["view", "form", "rule", "field", "select"].includes(input.type)) {
      const selected = configuredText(value);
      if (!options.some((option) => option.value === selected)) {
        throw new Error(
          `Block "${block.key}" config.${input.key} cannot be "${selected}". Valid options: ${optionValues(options)}.`,
        );
      }
      config[input.key] = selected;
    }
  }
  return config;
}

function configurePageBlock(spec: AppSpec, node: PageLayoutNode): PageLayoutNode {
  if (node.kind === "group") {
    return { ...node, blocks: node.blocks.map((child) => configurePageBlock(spec, child)) };
  }
  const definition = blockByKey(node.block);
  if (!definition) {
    throw new Error(
      `Unknown block "${node.block}". Valid blocks: ${blocks.map((item) => item.key).join(", ")}`,
    );
  }
  return {
    ...node,
    config: configureBlockConfig(spec, definition, node.config ?? {}),
  };
}

export function configurePageRows(spec: AppSpec, blocks: unknown): PageLayoutNode[] {
  return normalizePageRows(blocks).map((block) => configurePageBlock(spec, block));
}

const ROW_HEIGHTS = new Set<string>(["s", "m", "l", "xl"]);

export function rowHeight(value: unknown): PageRowHeight | undefined {
  if (typeof value === "string" && ROW_HEIGHTS.has(value)) return value as PageRowHeight;
  return undefined;
}

export function rowHeightClass(value: unknown): string {
  if (value === "s") return "min-h-48";
  if (value === "m") return "min-h-80";
  if (value === "l") return "min-h-[22rem]";
  if (value === "xl") return "min-h-[32rem]";
  return "";
}

const ROW_HEIGHT_RANK: Record<PageRowHeight, number> = { s: 1, m: 2, l: 3, xl: 4 };

export function defaultRowHeight(blocks: PageLayoutNode[]): PageRowHeight | undefined {
  let preferred: PageRowHeight | undefined;
  for (const block of normalizeBlockList(blocks)) {
    const candidate =
      block.kind === "group"
        ? (rowHeight(block.min_height) ?? defaultRowHeight(block.blocks))
        : blockByKey(block.block)?.defaultHeight;
    if (candidate && (!preferred || ROW_HEIGHT_RANK[candidate] > ROW_HEIGHT_RANK[preferred])) {
      preferred = candidate;
    }
  }
  return preferred;
}

/** Explicit row height wins; otherwise let blocks request the space their content needs. */
export function groupHeightClass(group: PageLayoutNode): string {
  if (group.kind !== "group") return "";
  return rowHeightClass(rowHeight(group.min_height) ?? defaultRowHeight(group.blocks));
}

export function normalizeBlock(block: PageLayoutNode): PageLayoutNode {
  const currentId = block.id;
  const id = currentId && isSpecId(currentId) ? currentId : createSpecId();
  if (block.kind === "group") {
    const height = rowHeight(block.min_height);
    return {
      id,
      kind: "group",
      columns: clampColumns(block.columns),
      ...(height ? { min_height: height } : {}),
      blocks: normalizeBlockList(block.blocks),
    };
  }
  return { id, kind: "block", block: block.block, config: { ...block.config } };
}

export function normalizePage(page: PageDef): PageDef {
  return { ...page, blocks: normalizePageRows(page.blocks) };
}

/** Page roots render as rows, so a valid root block receives a one-column row. */
export function normalizePageRows(blocks: unknown): PageLayoutNode[] {
  return normalizeBlockList(blocks).map((block) =>
    block.kind === "group"
      ? block
      : { id: createSpecId(), kind: "group", columns: 1, blocks: [block] },
  );
}

export function clampColumns(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function collectViewKeys(blocks: PageLayoutNode[]): string[] {
  const keys: string[] = [];
  for (const block of normalizeBlockList(blocks)) {
    if (block.kind === "group") keys.push(...collectViewKeys(block.blocks));
    if (block.kind === "block") {
      const view = typeof block.config?.view === "string" ? block.config.view : "";
      if (view) keys.push(view);
    }
  }
  return [...new Set(keys)];
}

function isPageLayoutNode(value: unknown): value is PageLayoutNode {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "block" || kind === "group";
}

/** Coerce WebMCP/JSON payloads: a one-child group often arrives as an object, not `[object]`. */
export function asBlockList(value: unknown): PageLayoutNode[] {
  if (value == null || value === false) return [];
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    try {
      return asBlockList(JSON.parse(text) as unknown);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value as PageLayoutNode[];
  if (isPageLayoutNode(value)) return [value];
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length && keys.every((key) => /^\d+$/.test(key))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => record[key]) as PageLayoutNode[];
    }
  }
  return [];
}

export function normalizeBlockList(blocks: unknown): PageLayoutNode[] {
  return asBlockList(blocks)
    .filter((block) => block?.kind === "block" || block?.kind === "group")
    .map(normalizeBlock);
}

export function implicitHomePage(spec: AppSpec): PageDef {
  const views = isBlankApp(spec) ? [] : homeViews(spec);
  const columns = Math.min(4, Math.max(1, views.length || 1));
  const stats: PageLayoutNode[] = views.map((view) => ({
    kind: "block",
    block: "stat",
    config: { view: view.key },
  }));
  const tables: PageLayoutNode[] = views.map((view) => ({
    kind: "group",
    columns: 1,
    blocks: [
      {
        kind: "block",
        block: "table",
        config: { view: view.key, compact: true },
      },
    ],
  }));
  return {
    id: "pg_home",
    key: HOME_PAGE_KEY,
    label: "Home",
    path: "/",
    implicit: true,
    blocks: [
      ...(stats.length ? [{ kind: "group" as const, columns, blocks: stats }] : []),
      ...tables,
    ],
  };
}

export function resolveHomePage(spec: AppSpec): PageDef {
  const authored = spec.pages.find((page) => page.key === HOME_PAGE_KEY || page.path === "/");
  if (authored) return normalizePage(authored);
  return implicitHomePage(spec);
}

export function resolvePage(spec: AppSpec, key: string): PageDef | undefined {
  if (key === HOME_PAGE_KEY) return resolveHomePage(spec);
  const page = spec.pages.find((item) => item.key === key);
  return page ? normalizePage(page) : undefined;
}

export function fieldsMatching(fields: FieldDef[], of?: BlockFieldKind): FieldDef[] {
  if (!of || of === "any") return fields;
  if (of === "date") {
    return [
      ...fields.filter((field) => field.type === "date"),
      {
        id: "created_at",
        key: "created_at",
        label: "Created",
        type: "date",
      },
      {
        id: "updated_at",
        key: "updated_at",
        label: "Updated",
        type: "date",
      },
    ];
  }
  if (of === "choice") return fields.filter((field) => field.type === "enum");
  return fields.filter((field) => field.type === of);
}

export function typeForView(spec: AppSpec, viewKey: string): TypeDef | undefined {
  const view = spec.views.find((item) => item.key === viewKey);
  if (!view) return undefined;
  return spec.types.find((item) => item.key === view.source);
}

export function fieldsForView(spec: AppSpec, viewKey: string): FieldDef[] {
  const view = spec.views.find((item) => item.key === viewKey);
  const type = typeForView(spec, viewKey);
  if (!view || !type) return [];
  if (!view.group_by) {
    if (!view.fields.length) return type.fields;
    return view.fields.map((path) => fieldForViewPath(spec, type, path));
  }
  const groupField = type?.fields.find((field) => field.key === view.group_by) ?? {
    id: `group_${view.group_by}`,
    key: view.group_by,
    label: labelFromKey(view.group_by),
    type: "text" as const,
  };
  const measures = Object.keys(view.measures ?? {}).map((key) => ({
    id: `measure_${key}`,
    key,
    label: labelFromKey(key),
    type: "number" as const,
  }));
  return [groupField, ...measures];
}

function fieldForViewPath(spec: AppSpec, type: TypeDef, path: string): FieldDef {
  let current: TypeDef | undefined = type;
  let found: FieldDef | undefined;
  const parts = path.split(".");
  for (const [index, part] of parts.entries()) {
    found = current?.fields.find((field) => field.key === part);
    if (!found) break;
    if (index < parts.length - 1 && found.type === "reference") {
      const targetKey: string | undefined = found.target?.split(".").at(-1);
      current = spec.types.find((candidate): boolean => candidate.key === targetKey);
    }
  }
  return {
    ...(found ?? { id: `view_${type.key}_${path}`, type: "text" as const }),
    key: path,
    label: columnLabel(path, type),
  };
}

export function defaultBlockConfig(block: BlockDefinition, spec: AppSpec): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const firstView = homeViews(spec)[0]?.key ?? spec.views[0]?.key ?? "";
  const firstForm =
    spec.forms.find((form) => form.mode === "create")?.key ?? spec.forms[0]?.key ?? "";
  const firstWorkflow =
    spec.workflows.find((workflow) => workflow.expose?.includes("ui") && !workflow.trigger)?.key ??
    "";
  const fields = fieldsForView(spec, firstView);
  for (const input of block.inputs) {
    if (input.type === "view") config[input.key] = firstView;
    else if (input.type === "form") config[input.key] = firstForm;
    else if (input.type === "rule") config[input.key] = firstWorkflow;
    else if (input.type === "boolean") config[input.key] = Boolean(input.default);
    else if (input.type === "field") {
      config[input.key] = fieldsMatching(fields, input.fieldKind)[0]?.key ?? "";
    } else if (input.type === "select") {
      config[input.key] = input.default ?? input.options?.[0]?.value ?? "";
    } else config[input.key] = input.default ?? "";
  }
  return config;
}

export function createBlockNode(block: BlockDefinition, spec: AppSpec): PageLayoutNode {
  return { kind: "block", block: block.key, config: defaultBlockConfig(block, spec) };
}

export function emptyGroup(columns = 1): PageLayoutNode {
  return { kind: "group", columns: clampColumns(columns), blocks: [] };
}

export function moveSibling(blocks: PageLayoutNode[], from: number, to: number): PageLayoutNode[] {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) {
    return blocks;
  }
  const copy = [...blocks];
  const [item] = copy.splice(from, 1);
  if (!item) return blocks;
  copy.splice(to, 0, item);
  return copy;
}

export function moveInGroup(
  blocks: PageLayoutNode[],
  groupIndex: number,
  from: number,
  to: number,
): PageLayoutNode[] {
  const group = blocks[groupIndex];
  if (group?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[groupIndex] = { ...group, blocks: moveSibling(group.blocks, from, to) };
  return copy;
}

export function setGroupColumns(
  blocks: PageLayoutNode[],
  index: number,
  columns: number,
): PageLayoutNode[] {
  const group = blocks[index];
  if (group?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[index] = { ...group, columns: clampColumns(columns) };
  return copy;
}

export function setGroupMinHeight(
  blocks: PageLayoutNode[],
  index: number,
  minHeight?: PageRowHeight,
): PageLayoutNode[] {
  const group = blocks[index];
  if (group?.kind !== "group") return blocks;
  const copy = [...blocks];
  const next = { ...group };
  if (minHeight) next.min_height = minHeight;
  else delete next.min_height;
  copy[index] = next;
  return copy;
}

export function setBlock(
  blocks: PageLayoutNode[],
  path: number[],
  next: PageLayoutNode,
): PageLayoutNode[] {
  if (!path.length) return blocks;
  const [head, ...rest] = path;
  if (head == null || head < 0 || head >= blocks.length) return blocks;
  if (!rest.length) {
    const copy = [...blocks];
    copy[head] = next;
    return copy;
  }
  const current = blocks[head];
  if (current?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[head] = { ...current, blocks: setBlock(current.blocks, rest, next) };
  return copy;
}

export function removeBlock(blocks: PageLayoutNode[], path: number[]): PageLayoutNode[] {
  if (!path.length) return blocks;
  const [head, ...rest] = path;
  if (head == null || head < 0 || head >= blocks.length) return blocks;
  if (!rest.length) return blocks.filter((_, index) => index !== head);
  const current = blocks[head];
  if (current?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[head] = { ...current, blocks: removeBlock(current.blocks, rest) };
  return copy;
}

export function insertBlock(
  blocks: PageLayoutNode[],
  path: number[],
  next: PageLayoutNode,
): PageLayoutNode[] {
  if (!path.length) return [...blocks, next];
  const [head, ...rest] = path;
  if (head == null) return [...blocks, next];
  if (!rest.length) {
    const copy = [...blocks];
    copy.splice(head, 0, next);
    return copy;
  }
  const current = blocks[head];
  if (current?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[head] = { ...current, blocks: insertBlock(current.blocks, rest, next) };
  return copy;
}

export function appendInGroup(
  blocks: PageLayoutNode[],
  groupPath: number[],
  next: PageLayoutNode,
): PageLayoutNode[] {
  if (!groupPath.length) return [...blocks, next];
  const group = blockAt(blocks, groupPath);
  if (group?.kind !== "group") return blocks;
  return setBlock(blocks, groupPath, { ...group, blocks: [...group.blocks, next] });
}

export function blockAt(blocks: PageLayoutNode[], path: number[]): PageLayoutNode | undefined {
  let current: PageLayoutNode[] = blocks;
  let found: PageLayoutNode | undefined;
  for (const index of path) {
    found = current[index];
    if (!found) return undefined;
    if (found.kind === "group") current = found.blocks;
    else current = [];
  }
  return found;
}

export function gridClass(columns: number): string {
  const cols = clampColumns(columns);
  if (cols <= 1) return "grid grid-cols-1 gap-4";
  if (cols === 2) return "grid grid-cols-1 gap-4 sm:grid-cols-2";
  if (cols === 3) return "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4";
}

export function firstViewKey(blocks: PageLayoutNode[]): string | undefined {
  for (const block of normalizeBlockList(blocks)) {
    if (block.kind === "block") {
      const view = typeof block.config?.view === "string" ? block.config.view : "";
      if (view) return view;
    }
    if (block.kind === "group") {
      const nested = firstViewKey(block.blocks);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function authoredNavPages(spec: AppSpec): PageDef[] {
  return spec.pages.filter(
    (page) => !page.implicit && page.key !== HOME_PAGE_KEY && page.path !== "/",
  );
}

export function pageHref(page: PageDef): string {
  if (page.key === HOME_PAGE_KEY || page.path === "/") return "/";
  return `/p/${page.key}`;
}

export function moveAuthoredPage(
  pages: PageDef[],
  fromKey: string,
  target: { folder: string | null; beforeKey?: string },
): PageDef[] {
  const source = pages.find((page) => page.key === fromKey);
  if (!source) return pages;
  const next = pages.filter((page) => page.key !== fromKey).map((page) => ({ ...page }));
  const moving: PageDef = { ...source, folder: target.folder || undefined };
  if (!moving.folder) delete moving.folder;
  if (target.beforeKey) {
    const to = next.findIndex((page) => page.key === target.beforeKey);
    if (to >= 0) next.splice(to, 0, moving);
    else next.push(moving);
    return next;
  }
  let insertAt = next.length;
  if (target.folder) {
    for (let i = next.length - 1; i >= 0; i--) {
      if ((next[i]?.folder?.trim() || null) === target.folder) {
        insertAt = i + 1;
        break;
      }
    }
  } else {
    const firstFolder = next.findIndex((page) => Boolean(page.folder?.trim()));
    insertAt = firstFolder < 0 ? next.length : firstFolder;
  }
  next.splice(insertAt, 0, moving);
  return next;
}

export function groupPagesByFolder(
  pages: PageDef[],
): Array<{ folder: string | null; pages: PageDef[] }> {
  const ungrouped: PageDef[] = [];
  const folders = new Map<string, PageDef[]>();
  const order: string[] = [];
  for (const page of pages) {
    const folder = page.folder?.trim();
    if (!folder) {
      ungrouped.push(page);
      continue;
    }
    const list = folders.get(folder);
    if (list) list.push(page);
    else {
      folders.set(folder, [page]);
      order.push(folder);
    }
  }
  const groups: Array<{ folder: string | null; pages: PageDef[] }> = [];
  if (ungrouped.length) groups.push({ folder: null, pages: ungrouped });
  for (const name of order) groups.push({ folder: name, pages: folders.get(name) ?? [] });
  return groups;
}

export function blockLabel(block: PageLayoutNode): string {
  if (block.kind !== "block") return "Section";
  return blockByKey(block.block)?.label ?? labelFromKey(block.block);
}
