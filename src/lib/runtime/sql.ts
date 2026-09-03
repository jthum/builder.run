import { systemColumns, type ColumnInfo } from "./engine.ts";
import { scalarString } from "./values.ts";

export function sqlIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier "${name}"`);
  }
  return `"${name}"`;
}

export function quoteList(names: string[]): string {
  return names.map(sqlIdent).join(", ");
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function createTableSql(table: string, columns: ColumnInfo[], strict = true): string {
  const cols = mergeColumns(columns);
  const body = cols
    .map((column) => {
      const extra = column.name === "id" ? " PRIMARY KEY" : "";
      const required = ["created_at", "updated_at", "created_by", "updated_by"].includes(
        column.name,
      )
        ? " NOT NULL"
        : "";
      return `${sqlIdent(column.name)} ${column.sqlType}${extra}${required}`;
    })
    .join(", ");
  return `CREATE TABLE IF NOT EXISTS ${sqlIdent(table)} (${body})${strict ? " STRICT" : ""}`;
}

export function mergeColumns(columns: ColumnInfo[]): ColumnInfo[] {
  const cols = [...systemColumns()];
  for (const column of columns) {
    if (!cols.some((existing) => existing.name === column.name)) cols.push(column);
  }
  return cols;
}

export function bindValue(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return scalarString(value);
}
