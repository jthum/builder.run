import type { PageDefinition, PageLayoutNode as LayoutNode, SpecMeta } from "@jthum/framework/spec";
import type { PageDef, PageLayoutNode } from "$lib/runtime/model.ts";
import { normalizePage } from "$lib/runtime/blocks.ts";

export function pageLayout(nodes: PageLayoutNode[]): LayoutNode[] {
  return nodes.map((node) =>
    node.kind === "group"
      ? {
          id: node.id!,
          kind: "group",
          columns: node.columns,
          minHeight: node.min_height,
          children: pageLayout(node.blocks),
        }
      : { id: node.id!, kind: "block", block: node.block, config: node.config as SpecMeta },
  );
}

export function pageBlocks(nodes: readonly LayoutNode[]): PageLayoutNode[] {
  return nodes.map((node) =>
    node.kind === "group"
      ? {
          id: node.id,
          kind: "group",
          columns: node.columns,
          min_height: node.minHeight,
          blocks: pageBlocks(node.children),
        }
      : { id: node.id, kind: "block", block: node.block, config: { ...node.config } },
  );
}

export function pageDefinition(page: PageDef): PageDefinition {
  const normalized = normalizePage(page);
  return {
    id: page.id,
    key: page.key,
    label: page.label,
    meta: {
      ...page.meta,
      ...(page.icon ? { icon: page.icon } : {}),
      ...(page.folder ? { folder: page.folder } : {}),
      ...(page.path ? { path: page.path } : {}),
    },
    layout: pageLayout(normalized.blocks ?? []),
  };
}

/** Temporary presentation projection while Builder's block catalog still uses PageDef. */
export function pagePresentation(page: PageDefinition): PageDef {
  return {
    id: page.id,
    key: page.key,
    label: page.label,
    ...(page.meta ? { meta: page.meta } : {}),
    ...(typeof page.meta?.icon === "string" ? { icon: page.meta.icon } : {}),
    ...(typeof page.meta?.folder === "string" ? { folder: page.meta.folder } : {}),
    ...(typeof page.meta?.path === "string" ? { path: page.meta.path } : {}),
    blocks: pageBlocks(page.layout),
  };
}
