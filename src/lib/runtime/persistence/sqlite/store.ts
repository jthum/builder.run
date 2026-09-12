import type { RecordValue, TypeDef } from "../../model.ts";
import type {
  RecordQueryPlan,
  RecordStore,
  RuntimeStore,
  SchemaMaterializer,
  StoreInspection,
} from "../../storage.ts";
import { applyStoreSchema, prepareStoreSchema, pruneStoreSchema } from "./schema.ts";
import type { TableEngine } from "./table-engine.ts";

/** SQLite implementation of the logical record and schema boundaries. */
export class SqliteRuntimeStore implements RuntimeStore, RecordStore, SchemaMaterializer {
  readonly records: RecordStore = this;
  readonly schema: SchemaMaterializer = this;

  constructor(private readonly engine: TableEngine) {}

  get name(): string {
    return this.engine.name;
  }

  create(type: TypeDef, values: Record<string, unknown>): Promise<RecordValue> {
    return this.engine.insert(type.key, values).then((record) => logicalRecord(type, record));
  }

  update(type: TypeDef, id: string, values: Record<string, unknown>): Promise<void> {
    return this.engine.update(type.key, id, values);
  }

  delete(type: TypeDef, id: string): Promise<void> {
    return this.engine.delete(type.key, id);
  }

  async get(type: TypeDef, id: string): Promise<RecordValue | null> {
    const record = await this.engine.get(type.key, id);
    return record ? logicalRecord(type, record) : null;
  }

  async query(type: TypeDef, plan: RecordQueryPlan = {}): Promise<RecordValue[]> {
    const records = await this.engine.select(type.key, {
      where: plan.filters,
      orderBy: plan.order
        ? Object.fromEntries(plan.order.map((item) => [item.field, item.direction]))
        : undefined,
      limit: plan.limit,
    });
    return records.map((record) => logicalRecord(type, record));
  }

  prepare(types: TypeDef[]): Promise<void> {
    return prepareStoreSchema(this.engine, types);
  }

  apply(types: TypeDef[]): Promise<string[]> {
    return this.engine.transaction(() => applyStoreSchema(this.engine, types));
  }

  prune(types: TypeDef[]): Promise<string[]> {
    return this.engine.transaction(() => pruneStoreSchema(this.engine, types));
  }

  async inspect(): Promise<StoreInspection> {
    const names = await this.engine.listTables();
    const collections = [];
    for (const name of names) {
      const columns = await this.engine.tableInfo(name);
      collections.push({
        name,
        fields: columns.map((column) => `${column.name} ${column.sqlType}`),
      });
    }
    return { name: this.name, collections };
  }

  async close(): Promise<void> {
    if ("close" in this.engine && typeof this.engine.close === "function") {
      await this.engine.close();
    }
  }
}

function logicalRecord(type: TypeDef, record: RecordValue): RecordValue {
  return {
    id: record.id,
    created_at: record.created_at,
    updated_at: record.updated_at,
    created_by: record.created_by,
    updated_by: record.updated_by,
    ...Object.fromEntries(type.fields.map((field) => [field.key, record[field.key]])),
  };
}
