import type { FilterClause, RecordValue } from "../../model.ts";

export interface ColumnInfo {
  name: string;
  sqlType: string;
}

export interface SelectOptions {
  where?: FilterClause[] | Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  limit?: number;
}

export interface TableEngine {
  readonly name: string;
  listTables(): Promise<string[]>;
  tableInfo(table: string): Promise<ColumnInfo[]>;
  createTable(table: string, columns: ColumnInfo[]): Promise<void>;
  addColumn(table: string, column: ColumnInfo): Promise<void>;
  renameColumn(table: string, from: string, to: string): Promise<void>;
  dropColumn(table: string, name: string): Promise<void>;
  renameTable(from: string, to: string): Promise<void>;
  dropTable(table: string): Promise<void>;
  insert(table: string, row: Record<string, unknown>): Promise<RecordValue>;
  update(table: string, id: string, patch: Record<string, unknown>): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  get(table: string, id: string): Promise<RecordValue | null>;
  select(table: string, options?: SelectOptions): Promise<RecordValue[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

const META_COLUMNS: ColumnInfo[] = [
  { name: "id", sqlType: "TEXT" },
  { name: "created_at", sqlType: "TEXT" },
  { name: "updated_at", sqlType: "TEXT" },
  { name: "created_by", sqlType: "TEXT" },
  { name: "updated_by", sqlType: "TEXT" },
];

export function systemColumns(idSqlType = "TEXT"): ColumnInfo[] {
  return META_COLUMNS.map((column) =>
    column.name === "id" ? { ...column, sqlType: idSqlType } : { ...column },
  );
}
