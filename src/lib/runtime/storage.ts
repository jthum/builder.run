import type { FilterClause } from "./filters.ts";
import type { PlatformState } from "./platform.ts";
import type { RecordValue, TypeDef } from "./model.ts";

/**
 * The storage-neutral portion of a record query. Relation traversal,
 * projection, and aggregation remain the query executor's responsibility.
 */
export interface RecordQueryPlan {
  filters?: FilterClause[];
  order?: Array<{ field: string; direction: "asc" | "desc" }>;
  limit?: number;
}

/** Logical record persistence used by forms, views, workflows, and WebMCP. */
export interface RecordStore {
  readonly name: string;
  create(type: TypeDef, values: Record<string, unknown>): Promise<RecordValue>;
  update(type: TypeDef, id: string, values: Record<string, unknown>): Promise<void>;
  delete(type: TypeDef, id: string): Promise<void>;
  get(type: TypeDef, id: string): Promise<RecordValue | null>;
  query(type: TypeDef, plan?: RecordQueryPlan): Promise<RecordValue[]>;
}

export interface StoreInspection {
  name: string;
  collections: Array<{ name: string; fields: string[] }>;
}

/** Applies a portable type model to the persistence technology used by a runtime. */
export interface SchemaMaterializer {
  prepare(types: TypeDef[]): Promise<void>;
  apply(types: TypeDef[]): Promise<string[]>;
  prune(types: TypeDef[]): Promise<string[]>;
  inspect(): Promise<StoreInspection>;
}

/** Persists runtime-owned workspace state; it is not part of the app spec. */
export interface CatalogRepository {
  readonly name: string;
  load(): Promise<PlatformState | null>;
  save(platform: PlatformState): Promise<void>;
  collections(): Promise<string[]>;
  close(): Promise<void>;
}

export interface RuntimeStore {
  records: RecordStore;
  schema: SchemaMaterializer;
  close(): Promise<void>;
}

/** Complete persistence plug-in consumed by the browser Host. */
export interface RuntimePersistence {
  readonly kind: string;
  readonly backend: string;
  openCatalog(): Promise<CatalogRepository>;
  openStore(ownerId: string): Promise<RuntimeStore>;
  wipe(): Promise<void>;
}
