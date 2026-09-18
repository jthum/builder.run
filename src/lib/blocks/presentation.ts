import type { SpecMeta } from "@jthum/framework/spec";
import type {
  CollectionDraft,
  ViewDraft,
  FormDraft,
  RuleDraft,
} from "@jthum/framework/svelte/studio/data";
export type {
  CollectionDraft,
  FieldDraft,
  ViewDraft,
  FormDraft,
  RuleDraft,
  FieldKind,
  FieldCondition,
  FilterClause,
  FilterOp,
  ValueSemantic,
} from "@jthum/framework/svelte/studio/data";
export { FIELD_CAPABILITIES, FIELD_KINDS } from "@jthum/framework/svelte/studio/data";

export type RowHeight = "s" | "m" | "l" | "xl";
export type PageNode =
  | { id?: string; kind: "block"; block: string; config?: Record<string, unknown> }
  | { id?: string; kind: "group"; columns?: number; min_height?: RowHeight; blocks: PageNode[] };
export interface PagePresentation {
  id: string;
  key: string;
  label: string;
  meta?: SpecMeta;
  path?: string;
  folder?: string;
  icon?: string;
  blocks: PageNode[];
  implicit?: boolean;
}
/** Resolved UI working models only. Never serialized, imported, or persisted as an App Spec. */
export interface PageContext {
  id: string;
  key: string;
  label: string;
  meta?: SpecMeta;
  types: CollectionDraft[];
  views: ViewDraft[];
  forms: FormDraft[];
  workflows: RuleDraft[];
  pages: PagePresentation[];
}
