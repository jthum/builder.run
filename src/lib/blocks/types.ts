import type { AppSpec, PageRowHeight } from "$lib/runtime/model.ts";
import type { Component } from "svelte";

export type BlockCategory = "highlights" | "content" | "data" | "charts" | "actions";

export type BlockInputType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "view"
  | "form"
  | "workflow"
  | "field"
  | "select";

export type BlockFieldKind = "number" | "date" | "enum" | "any";

export interface BlockInput {
  key: string;
  label: string;
  type: BlockInputType;
  description?: string;
  required?: boolean;
  default?: unknown;
  of?: BlockFieldKind;
  /** Key of the input that selects the source for a field input. */
  source?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface BlockDefinition {
  key: string;
  label: string;
  description: string;
  category: BlockCategory;
  order?: number;
  /** Used when a grid row is automatic and the block needs plot space. */
  defaultRowHeight?: PageRowHeight;
  inputs: BlockInput[];
}

export interface BlockProps {
  config: Record<string, unknown>;
  rows: Record<string, Array<Record<string, unknown>>>;
  ready?: boolean;
  spec?: AppSpec;
}

export type BlockComponent = Component<BlockProps>;

export interface BlockModule {
  default: BlockComponent;
}

export interface BlockPreview {
  config: Record<string, unknown>;
  rows?: Record<string, Array<Record<string, unknown>>>;
  spec?: AppSpec;
}

export interface BlockPreviewModule {
  default: BlockPreview;
}

/** A normalized catalog that has been installed into the application bundle. */
export interface BlockRegistrySource {
  key: string;
  label: string;
  description: string;
  kind: "bundled";
  blocks: readonly BlockDefinition[];
  load: (key: string) => Promise<BlockComponent | undefined>;
  loadPreview: (key: string) => Promise<BlockPreview | undefined>;
}
