import { createId } from "./ids.ts";
import { nowIso, type RecordValue } from "./model.ts";

export interface ColumnInfo {
  name: string;
  sqlType: string;
}

export interface SelectOptions {
  where?: Record<string, unknown>;
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

interface MemoryTable {
  columns: ColumnInfo[];
  rows: Map<string, RecordValue>;
}

export class MemoryEngine implements TableEngine {
  readonly name: string;
  private tables = new Map<string, MemoryTable>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(name = "memory") {
    this.name = name;
  }

  private enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listTables(): Promise<string[]> {
    return [...this.tables.keys()];
  }

  async tableInfo(table: string): Promise<ColumnInfo[]> {
    return this.tables.get(table)?.columns.map((column) => ({ ...column })) ?? [];
  }

  async createTable(table: string, columns: ColumnInfo[]): Promise<void> {
    if (this.tables.has(table)) return;
    const cols = [...systemColumns()];
    for (const column of columns) {
      if (!cols.some((existing) => existing.name === column.name)) cols.push(column);
    }
    this.tables.set(table, { columns: cols, rows: new Map() });
  }

  async addColumn(table: string, column: ColumnInfo): Promise<void> {
    const current = this.requireTable(table);
    if (current.columns.some((existing) => existing.name === column.name)) return;
    current.columns.push(column);
    for (const row of current.rows.values()) {
      if (!(column.name in row)) row[column.name] = null;
    }
  }

  async renameColumn(table: string, from: string, to: string): Promise<void> {
    if (from === to) return;
    const current = this.requireTable(table);
    const column = current.columns.find((item) => item.name === from);
    if (!column) return;
    column.name = to;
    for (const row of current.rows.values()) {
      row[to] = row[from];
      delete row[from];
    }
  }

  async dropColumn(table: string, name: string): Promise<void> {
    const current = this.requireTable(table);
    current.columns = current.columns.filter((column) => column.name !== name);
    for (const row of current.rows.values()) delete row[name];
  }

  async renameTable(from: string, to: string): Promise<void> {
    if (from === to) return;
    const current = this.tables.get(from);
    if (!current) return;
    this.tables.delete(from);
    this.tables.set(to, current);
  }

  async dropTable(table: string): Promise<void> {
    this.tables.delete(table);
  }

  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    const current = this.requireTable(table);
    const id = String(row.id ?? createId("rec"));
    const record: RecordValue = {
      id,
      created_at: String(row.created_at ?? nowIso()),
      updated_at: String(row.updated_at ?? nowIso()),
      created_by: String(row.created_by ?? ""),
      updated_by: String(row.updated_by ?? ""),
    };
    for (const column of current.columns) {
      if (column.name in record) continue;
      record[column.name] = row[column.name] ?? null;
    }
    current.rows.set(id, record);
  }

  async update(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const current = this.requireTable(table);
    const row = current.rows.get(id);
    if (!row) throw new Error(`Record ${id} not found in ${table}`);
    for (const [key, value] of Object.entries(patch)) {
      if (key === "id") continue;
      row[key] = value as never;
    }
    row.updated_at = String(patch.updated_at ?? nowIso());
  }

  async delete(table: string, id: string): Promise<void> {
    this.requireTable(table).rows.delete(id);
  }

  async get(table: string, id: string): Promise<RecordValue | null> {
    return this.tables.get(table)?.rows.get(id) ?? null;
  }

  async select(table: string, options: SelectOptions = {}): Promise<RecordValue[]> {
    const current = this.tables.get(table);
    if (!current) return [];
    let rows = [...current.rows.values()];
    if (options.where) {
      rows = rows.filter((row) => matchesWhere(row, options.where as Record<string, unknown>));
    }
    if (options.orderBy) {
      const entries = Object.entries(options.orderBy);
      rows.sort((left, right) => {
        for (const [key, direction] of entries) {
          const compared = compareValues(left[key], right[key]);
          if (compared !== 0) return direction === "desc" ? -compared : compared;
        }
        return 0;
      });
    }
    if (options.limit != null) rows = rows.slice(0, options.limit);
    return rows.map((row) => ({ ...row }));
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(fn);
  }

  async dump(): Promise<Record<string, RecordValue[]>> {
    const data: Record<string, RecordValue[]> = {};
    for (const [name, table] of this.tables) {
      data[name] = [...table.rows.values()].map((row) => ({ ...row }));
    }
    return data;
  }

  async load(data: Record<string, RecordValue[]>): Promise<void> {
    for (const [name, rows] of Object.entries(data)) {
      if (!this.tables.has(name)) {
        const columns = new Map<string, ColumnInfo>();
        for (const sys of systemColumns()) columns.set(sys.name, sys);
        for (const row of rows) {
          for (const key of Object.keys(row)) {
            if (!columns.has(key)) columns.set(key, { name: key, sqlType: "TEXT" });
          }
        }
        this.tables.set(name, { columns: [...columns.values()], rows: new Map() });
      }
      for (const row of rows) {
        this.requireTable(name).rows.set(row.id, { ...row });
      }
    }
  }

  private requireTable(table: string): MemoryTable {
    const current = this.tables.get(table);
    if (!current) throw new Error(`Unknown table ${table}`);
    return current;
  }
}

export function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (!valuesEqual(row[key], expected)) return false;
  }
  return true;
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) === Boolean(right);
  }
  return String(left ?? "") === String(right ?? "");
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
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
