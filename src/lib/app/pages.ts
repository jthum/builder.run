import type { PageDefinition, PageLayoutNode as LayoutNode } from "@jthum/framework/spec";
import type { PagePresentation, PageNode } from "$lib/blocks/presentation.ts";
import type { PageContext } from "$lib/blocks/presentation.ts";
import type { EditorContext } from "@jthum/framework/svelte/studio/data";
import type { Spec } from "@jthum/framework/spec";

export function pageBlocks(nodes: readonly LayoutNode[]): PageNode[] {
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

/** One-way presentation projection for the host's Block catalog. */
export function pagePresentation(page: PageDefinition): PagePresentation {
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

/** Builder block-catalog input derived from canonical definitions; never persisted. */
export function pageContext(spec: Spec, context: EditorContext): PageContext {
  return {
    id: spec.id,
    key: spec.key,
    label: spec.label,
    ...(spec.meta ? { meta: spec.meta } : {}),
    types: context.collections.map((collection) => ({ ...collection })),
    views: context.views.map((view) => ({ ...view })),
    forms: context.forms.map((form) => ({ ...form })),
    workflows: context.rules.map((rule) => ({ ...rule })),
    pages: spec.pages.map(pagePresentation),
  };
}
