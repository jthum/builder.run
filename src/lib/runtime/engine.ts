import type { FilterClause, RecordValue } from "./model.ts";
import { matchFilters, normalizeFilters } from "./filters.ts";

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
  insert(table: string, row: Record<string, unknown>): Promise<void>;
  update(table: string, id: string, patch: Record<string, unknown>): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  get(table: string, id: string): Promise<RecordValue | null>;
  select(table: string, options?: SelectOptions): Promise<RecordValue[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  dump(): Promise<Record<string, RecordValue[]>>;
  load(data: Record<string, RecordValue[]>): Promise<void>;
}

const META_COLUMNS: ColumnInfo[] = [
  { name: "id", sqlType: "TEXT" },
  { name: "created_at", sqlType: "TEXT" },
  { name: "updated_at", sqlType: "TEXT" },
  { name: "created_by", sqlType: "TEXT" },
  { name: "updated_by", sqlType: "TEXT" },
];

export function systemColumns(): ColumnInfo[] {
  return META_COLUMNS.map((column) => ({ ...column }));
}

export function matchesWhere(
  row: Record<string, unknown>,
  where: FilterClause[] | Record<string, unknown>,
): boolean {
  return matchFilters(row, normalizeFilters(where));
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) === Boolean(right);
  }
  return String(left ?? "") === String(right ?? "");
}

export function coerceFieldValue(type: string, value: unknown): unknown {
  if (value == null || value === "") return null;
  switch (type) {
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === 1 || value === "1") return true;
      if (value === "false" || value === 0 || value === "0") return false;
      return Boolean(value);
    default:
      return value;
  }
}
