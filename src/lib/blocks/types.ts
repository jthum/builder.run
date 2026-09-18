import type { PageContext } from "$lib/blocks/presentation.ts";
import type {
  BlockDefinition as PortableBlockDefinition,
  BlockFieldKind,
  BlockInputDefinition,
  BlockInputType,
} from "@jthum/framework/blocks";
import type { CatalogSource } from "@jthum/framework/catalog";
import type { Component } from "svelte";

export type BlockCategory = "highlights" | "content" | "data" | "charts" | "actions";
export type { BlockFieldKind, BlockInputType };
export type BlockInput = BlockInputDefinition;
export type BlockDefinition = Omit<
  PortableBlockDefinition,
  "category" | "description" | "inputs"
> & {
  readonly category: BlockCategory;
  readonly description: string;
  readonly inputs: readonly BlockInput[];
};

export interface BlockProps {
  config: Record<string, unknown>;
  rows: Record<string, Array<Record<string, unknown>>>;
  ready?: boolean;
  spec?: PageContext;
}

export type BlockComponent = Component<BlockProps>;

export interface BlockModule {
  default: BlockComponent;
}

export interface BlockPreview {
  config: Record<string, unknown>;
  rows?: Record<string, Array<Record<string, unknown>>>;
  spec?: PageContext;
}

export interface BlockPreviewModule {
  default: BlockPreview;
}

/** A normalized catalog that has been installed into the application bundle. */
export interface BlockSource extends CatalogSource<BlockDefinition> {
  kind: "bundled";
  load: (key: string) => Promise<BlockComponent | undefined>;
  loadPreview: (key: string) => Promise<BlockPreview | undefined>;
}
