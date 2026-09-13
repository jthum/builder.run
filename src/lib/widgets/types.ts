import type { AppSpec, PageRowHeight } from "$lib/runtime/model.ts";
import type { Component } from "svelte";

export type WidgetCategory = "highlights" | "content" | "data" | "charts" | "actions";

export type WidgetInputType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "view"
  | "form"
  | "workflow"
  | "field"
  | "select";

export type WidgetFieldKind = "number" | "date" | "enum" | "any";

export interface WidgetInput {
  key: string;
  label: string;
  type: WidgetInputType;
  description?: string;
  required?: boolean;
  default?: unknown;
  of?: WidgetFieldKind;
  /** Key of the input that selects the source for a field input. */
  source?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface WidgetDef {
  key: string;
  label: string;
  description: string;
  category: WidgetCategory;
  order?: number;
  /** Used when a grid row is automatic and the widget needs plot space. */
  defaultRowHeight?: PageRowHeight;
  inputs: WidgetInput[];
}

export interface WidgetRendererProps {
  values: Record<string, unknown>;
  rows: Record<string, Array<Record<string, unknown>>>;
  ready?: boolean;
  spec?: AppSpec;
}

export type WidgetRenderer = Component<WidgetRendererProps>;

export interface WidgetModule {
  default: WidgetRenderer;
}
