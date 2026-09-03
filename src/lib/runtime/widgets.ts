import { homeViews, isBlankApp } from "$lib/app/labels.ts";
import type { AppSpec, FieldDef, PageBlock, PageDef, PageRowHeight, TypeDef } from "./model.ts";
import { labelFromKey } from "./ids.ts";

export const HOME_PAGE_KEY = "home";

export type WidgetCategory = "content" | "data" | "actions";

export type WidgetInputType =
  | "text"
  | "textarea"
  | "boolean"
  | "view"
  | "form"
  | "flow"
  | "field"
  | "select";

export type WidgetFieldKind = "number" | "date" | "enum" | "any";

export interface WidgetInput {
  key: string;
  label: string;
  type: WidgetInputType;
  required?: boolean;
  default?: unknown;
  of?: WidgetFieldKind;
  options?: Array<{ value: string; label: string }>;
}

export interface WidgetDef {
  key: string;
  label: string;
  description: string;
  category: WidgetCategory;
  inputs: WidgetInput[];
}

export const widgetCategories: Array<{ key: WidgetCategory; label: string }> = [
  { key: "content", label: "Content" },
  { key: "data", label: "Data" },
  { key: "actions", label: "Actions" },
];

export const widgets: WidgetDef[] = [
  {
    key: "heading",
    label: "Heading",
    description: "A title and optional supporting text.",
    category: "content",
    inputs: [
      { key: "title", label: "Title", type: "text", required: true, default: "Heading" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    key: "text",
    label: "Text",
    description: "A paragraph of copy.",
    category: "content",
    inputs: [{ key: "text", label: "Text", type: "textarea", required: true }],
  },
  {
    key: "stat",
    label: "Number card",
    description: "A count from a view.",
    category: "data",
    inputs: [{ key: "view", label: "View", type: "view", required: true }],
  },
  {
    key: "table",
    label: "Table",
    description: "Rows from a view, in columns.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "compact", label: "Compact", type: "boolean", default: false },
    ],
  },
  {
    key: "cards",
    label: "Cards",
    description: "A grid of cards from a view.",
    category: "data",
    inputs: [{ key: "view", label: "View", type: "view", required: true }],
  },
  {
    key: "list",
    label: "List",
    description: "A compact list from a view.",
    category: "data",
    inputs: [{ key: "view", label: "View", type: "view", required: true }],
  },
  {
    key: "form",
    label: "Form",
    description: "A form for adding or editing a record.",
    category: "actions",
    inputs: [{ key: "form", label: "Form", type: "form", required: true }],
  },
  {
    key: "action",
    label: "Button",
    description: "Runs a button rule.",
    category: "actions",
    inputs: [
      { key: "flow", label: "Rule", type: "flow", required: true },
      { key: "label", label: "Label", type: "text", default: "Run" },
    ],
  },
  {
    key: "callout",
    label: "Callout",
    description: "A short note, warning, or next step on the page.",
    category: "content",
    inputs: [
      { key: "title", label: "Title", type: "text", default: "Note" },
      { key: "text", label: "Text", type: "textarea", required: true },
      {
        key: "tone",
        label: "Tone",
        type: "select",
        default: "note",
        options: [
          { value: "note", label: "Note" },
          { value: "warning", label: "Warning" },
          { value: "danger", label: "Danger" },
        ],
      },
    ],
  },
  {
    key: "metric",
    label: "Metric",
    description: "A total from a view, with a sparkline when there is a date.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "value", label: "Value field", type: "field", of: "number" },
      { key: "date", label: "Date field", type: "field", of: "date" },
    ],
  },
  {
    key: "bar",
    label: "Bar chart",
    description: "Counts or sums from a view, grouped by a field.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "category", label: "Group by", type: "field", of: "any", required: true },
      { key: "value", label: "Value field", type: "field", of: "number" },
    ],
  },
  {
    key: "line",
    label: "Line chart",
    description: "A number over time from a view.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "category", label: "Date field", type: "field", of: "date", required: true },
      { key: "value", label: "Value field", type: "field", of: "number" },
    ],
  },
  {
    key: "donut",
    label: "Donut chart",
    description: "Share of a whole from a view.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "category", label: "Group by", type: "field", of: "enum", required: true },
      { key: "value", label: "Value field", type: "field", of: "number" },
    ],
  },
  {
    key: "stacked_bar",
    label: "Stacked bar",
    description: "A bar chart split by a second field, such as billable vs unbilled.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "category", label: "Group by", type: "field", of: "any", required: true },
      { key: "series", label: "Split by", type: "field", of: "enum", required: true },
      { key: "value", label: "Value field", type: "field", of: "number" },
    ],
  },
  {
    key: "kanban",
    label: "Board",
    description: "Cards from a view, in columns by an enum field.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "field", label: "Column field", type: "field", of: "enum", required: true },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "Records from a view, placed on a month by a date field.",
    category: "data",
    inputs: [
      { key: "view", label: "View", type: "view", required: true },
      { key: "date", label: "Date field", type: "field", of: "date", required: true },
    ],
  },
];

export function widgetByKey(key: string): WidgetDef | undefined {
  return widgets.find((item) => item.key === key);
}

const ROW_HEIGHTS = new Set<string>(["s", "m", "l", "xl"]);

export function rowHeight(value: unknown): PageRowHeight | undefined {
  if (typeof value === "string" && ROW_HEIGHTS.has(value)) return value as PageRowHeight;
  return undefined;
}

export function rowHeightClass(value: unknown): string {
  if (value === "s") return "min-h-48";
  if (value === "m") return "min-h-64";
  if (value === "l") return "min-h-96";
  if (value === "xl") return "min-h-[28rem]";
  return "";
}

export function normalizeBlock(block: PageBlock): PageBlock {
  if (block.kind === "group") {
    const height = rowHeight(block.min_height);
    return {
      kind: "group",
      columns: clampColumns(block.columns),
      ...(height ? { min_height: height } : {}),
      blocks: normalizeBlockList(block.blocks),
    };
  }
  return { kind: "widget", widget: block.widget, values: { ...block.values } };
}

export function normalizePage(page: PageDef): PageDef {
  return { ...page, blocks: normalizeBlockList(page.blocks) };
}

export function clampColumns(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.round(n)));
}

export function collectViewKeys(blocks: PageBlock[]): string[] {
  const keys: string[] = [];
  for (const block of normalizeBlockList(blocks)) {
    if (block.kind === "group") keys.push(...collectViewKeys(block.blocks));
    if (block.kind === "widget") {
      const view = String(block.values?.view ?? "");
      if (view) keys.push(view);
    }
  }
  return [...new Set(keys)];
}

function isPageBlock(value: unknown): value is PageBlock {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "widget" || kind === "group";
}

/** Coerce WebMCP/JSON payloads: a one-child group often arrives as an object, not `[object]`. */
export function asBlockList(value: unknown): PageBlock[] {
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
  if (Array.isArray(value)) return value as PageBlock[];
  if (isPageBlock(value)) return [value];
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length && keys.every((key) => /^\d+$/.test(key))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map((key) => record[key]) as PageBlock[];
    }
  }
  return [];
}

export function normalizeBlockList(blocks: unknown): PageBlock[] {
  return asBlockList(blocks)
    .filter((block) => block?.kind === "widget" || block?.kind === "group")
    .map(normalizeBlock);
}

export function implicitHomePage(spec: AppSpec): PageDef {
  const views = isBlankApp(spec) ? [] : homeViews(spec);
  const columns = Math.min(4, Math.max(1, views.length || 1));
  const stats: PageBlock[] = views.map((view) => ({
    kind: "widget",
    widget: "stat",
    values: { view: view.key },
  }));
  const tables: PageBlock[] = views.map((view) => ({
    kind: "group",
    columns: 1,
    blocks: [
      {
        kind: "widget",
        widget: "table",
        values: { view: view.key, compact: true },
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

export function fieldsMatching(fields: FieldDef[], of?: WidgetFieldKind): FieldDef[] {
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
  return fields.filter((field) => field.type === of);
}

export function typeForView(spec: AppSpec, viewKey: string): TypeDef | undefined {
  const view = spec.views.find((item) => item.key === viewKey);
  if (!view) return undefined;
  return spec.types.find((item) => item.key === view.source);
}

export function defaultWidgetValues(widget: WidgetDef, spec: AppSpec): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const firstView = homeViews(spec)[0]?.key ?? spec.views[0]?.key ?? "";
  const firstForm =
    spec.forms.find((form) => form.mode === "create")?.key ?? spec.forms[0]?.key ?? "";
  const firstFlow =
    spec.flows.find((flow) => flow.expose?.includes("ui") && !flow.trigger)?.key ?? "";
  const type = typeForView(spec, firstView);
  const fields = type?.fields ?? [];
  for (const input of widget.inputs) {
    if (input.type === "view") values[input.key] = firstView;
    else if (input.type === "form") values[input.key] = firstForm;
    else if (input.type === "flow") values[input.key] = firstFlow;
    else if (input.type === "boolean") values[input.key] = Boolean(input.default);
    else if (input.type === "field") {
      values[input.key] = fieldsMatching(fields, input.of)[0]?.key ?? fields[0]?.key ?? "";
    } else if (input.type === "select") {
      values[input.key] = input.default ?? input.options?.[0]?.value ?? "";
    } else values[input.key] = input.default ?? "";
  }
  return values;
}

export function widgetBlock(widget: WidgetDef, spec: AppSpec): PageBlock {
  return { kind: "widget", widget: widget.key, values: defaultWidgetValues(widget, spec) };
}

export function emptyGroup(columns = 1): PageBlock {
  return { kind: "group", columns: clampColumns(columns), blocks: [] };
}

export function moveSibling(blocks: PageBlock[], from: number, to: number): PageBlock[] {
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
  blocks: PageBlock[],
  groupIndex: number,
  from: number,
  to: number,
): PageBlock[] {
  const group = blocks[groupIndex];
  if (group?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[groupIndex] = { ...group, blocks: moveSibling(group.blocks, from, to) };
  return copy;
}

export function setGroupColumns(blocks: PageBlock[], index: number, columns: number): PageBlock[] {
  const group = blocks[index];
  if (group?.kind !== "group") return blocks;
  const copy = [...blocks];
  copy[index] = { ...group, columns: clampColumns(columns) };
  return copy;
}

export function setGroupMinHeight(
  blocks: PageBlock[],
  index: number,
  minHeight?: PageRowHeight,
): PageBlock[] {
  const group = blocks[index];
  if (group?.kind !== "group") return blocks;
  const copy = [...blocks];
  const next = { ...group };
  if (minHeight) next.min_height = minHeight;
  else delete next.min_height;
  copy[index] = next;
  return copy;
}

export function setBlock(blocks: PageBlock[], path: number[], next: PageBlock): PageBlock[] {
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

export function removeBlock(blocks: PageBlock[], path: number[]): PageBlock[] {
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

export function insertBlock(blocks: PageBlock[], path: number[], next: PageBlock): PageBlock[] {
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
  blocks: PageBlock[],
  groupPath: number[],
  next: PageBlock,
): PageBlock[] {
  if (!groupPath.length) return [...blocks, next];
  const group = blockAt(blocks, groupPath);
  if (group?.kind !== "group") return blocks;
  return setBlock(blocks, groupPath, { ...group, blocks: [...group.blocks, next] });
}

export function blockAt(blocks: PageBlock[], path: number[]): PageBlock | undefined {
  let current: PageBlock[] = blocks;
  let found: PageBlock | undefined;
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

export function firstViewKey(blocks: PageBlock[]): string | undefined {
  for (const block of normalizeBlockList(blocks)) {
    if (block.kind === "widget") {
      const view = String(block.values?.view ?? "");
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

export function widgetLabel(block: PageBlock): string {
  if (block.kind !== "widget") return "Section";
  return widgetByKey(block.widget)?.label ?? labelFromKey(block.widget);
}
