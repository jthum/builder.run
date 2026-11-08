import type { CollectionDefinition, Spec } from "@jthum/framework/spec";

export interface QueryPlan {
  readonly shape: string;
  readonly index: string;
  readonly columns: readonly string[];
}
export interface DeployedCollection {
  readonly definition: CollectionDefinition;
  readonly table: string;
  readonly fields: readonly {
    readonly id: string;
    readonly column: string;
    readonly storage: "string" | "number" | "boolean";
    readonly json: boolean;
  }[];
  readonly plans: readonly QueryPlan[];
}
export interface Deployment {
  readonly spec: Spec;
  readonly workspaceId: string;
  readonly collections: readonly DeployedCollection[];
}

// Structural view of Zero's public API. Kept local so this optional target adds no SDK dependency
// to Framework or the main app. Its generated capsule is separately checked against the real SDK.
export interface ZeroRow {
  readonly id: string;
  readonly [key: string]: unknown;
}
export interface ZeroRange {
  eq(field: string, value: unknown): ZeroRange;
  gt(field: string, value: unknown): ZeroRange;
  gte(field: string, value: unknown): ZeroRange;
  lt(field: string, value: unknown): ZeroRange;
  lte(field: string, value: unknown): ZeroRange;
}
export interface ZeroQuery {
  order(direction: "asc" | "desc"): ZeroQuery;
  collect(): Promise<ZeroRow[]>;
  take(count: number): Promise<ZeroRow[]>;
  first(): Promise<ZeroRow | null>;
  count(): Promise<number>;
  paginate(options: {
    cursor: string | null;
    numItems: number;
  }): Promise<{ page: ZeroRow[]; isDone: boolean; continueCursor: string | null }>;
}
export interface ZeroReadTable {
  withIndex(index: string, range: (range: ZeroRange) => ZeroRange): ZeroQuery;
}
export interface ZeroTable extends ZeroReadTable {
  insert(value: object): Promise<ZeroRow>;
  update(id: string, value: object): Promise<ZeroRow | null>;
  delete(id: string): Promise<boolean>;
}
export type ZeroDatabase = Readonly<Record<string, ZeroTable>>;
export type ZeroReadDatabase = Readonly<Record<string, ZeroReadTable>>;
