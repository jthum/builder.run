import { inValues, normalizeFilters, type FilterClause } from "../../filters.ts";
import { nowIso, type RecordValue } from "../../model.ts";
import { scalarString } from "../../values.ts";
import type { SqlConnection } from "./gateway.ts";
import { bindValue, createTableSql, placeholders, quoteList, sqlIdent } from "./sql.ts";
import {
  type ColumnInfo,
  type SelectOptions,
  type TableEngine,
  systemColumns,
} from "./table-engine.ts";

export class SqliteEngine implements TableEngine {
  readonly name: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly conn: SqlConnection,
    name: string,
  ) {
    this.name = name;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listTables(): Promise<string[]> {
    const rows = await this.conn.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    return rows.map((row) => String(row.name));
  }

  async tableInfo(table: string): Promise<ColumnInfo[]> {
    const rows = await this.conn.query(`PRAGMA table_info(${sqlIdent(table)})`);
    return rows.map((row) => ({
      name: String(row.name),
      sqlType: scalarString(row.type || "TEXT"),
    }));
  }

  async createTable(table: string, columns: ColumnInfo[]): Promise<void> {
    try {
      await this.conn.exec(createTableSql(table, columns, true));
    } catch {
      await this.conn.exec(createTableSql(table, columns, false));
    }
  }

  async addColumn(table: string, column: ColumnInfo): Promise<void> {
    await this.conn.exec(
      `ALTER TABLE ${sqlIdent(table)} ADD COLUMN ${sqlIdent(column.name)} ${column.sqlType}`,
    );
  }

  async renameColumn(table: string, from: string, to: string): Promise<void> {
    if (from === to) return;
    await this.conn.exec(
      `ALTER TABLE ${sqlIdent(table)} RENAME COLUMN ${sqlIdent(from)} TO ${sqlIdent(to)}`,
    );
  }

  async dropColumn(table: string, name: string): Promise<void> {
    await this.conn.exec(`ALTER TABLE ${sqlIdent(table)} DROP COLUMN ${sqlIdent(name)}`);
  }

  async renameTable(from: string, to: string): Promise<void> {
    if (from === to) return;
    await this.conn.exec(`ALTER TABLE ${sqlIdent(from)} RENAME TO ${sqlIdent(to)}`);
  }

  async dropTable(table: string): Promise<void> {
    await this.conn.exec(`DROP TABLE IF EXISTS ${sqlIdent(table)}`);
  }

  async insert(table: string, row: Record<string, unknown>): Promise<RecordValue> {
    const columns = await this.writableColumns(table);
    const payload: Record<string, unknown> = {
      created_at: row.created_at ?? nowIso(),
      updated_at: row.updated_at ?? nowIso(),
      created_by: row.created_by ?? "",
      updated_by: row.updated_by ?? "",
      ...row,
    };
    const names = columns.map((column) => column.name);
    const values = names.map((name) => bindValue(payload[name] ?? null));
    const rows = await this.conn.query(
      `INSERT INTO ${sqlIdent(table)} (${quoteList(names)}) VALUES (${placeholders(names.length)}) RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`SQLite did not return the inserted ${table} record`);
    return asRecord(rows[0]);
  }

  async update(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const columns = new Set((await this.writableColumns(table)).map((column) => column.name));
    const entries = Object.entries(patch).filter(([key]) => key !== "id" && columns.has(key));
    if (!entries.length) return;
    const assignments = entries.map(([key]) => `${sqlIdent(key)} = ?`).join(", ");
    const values = entries.map(([, value]) => bindValue(value));
    values.push(id);
    await this.conn.exec(
      `UPDATE ${sqlIdent(table)} SET ${assignments} WHERE ${sqlIdent("id")} = ?`,
      values,
    );
  }

  async delete(table: string, id: string): Promise<void> {
    await this.conn.exec(`DELETE FROM ${sqlIdent(table)} WHERE ${sqlIdent("id")} = ?`, [id]);
  }

  async get(table: string, id: string): Promise<RecordValue | null> {
    const rows = await this.conn.query(
      `SELECT * FROM ${sqlIdent(table)} WHERE ${sqlIdent("id")} = ?`,
      [id],
    );
    return rows[0] ? asRecord(rows[0]) : null;
  }

  async select(table: string, options: SelectOptions = {}): Promise<RecordValue[]> {
    let sql = `SELECT * FROM ${sqlIdent(table)}`;
    const params: unknown[] = [];
    const clauses = normalizeFilters(options.where).filter((clause) => !clause.field.includes("."));
    if (clauses.length) {
      const parts: string[] = [];
      for (const clause of clauses) {
        const compiled = sqlFilter(clause);
        if (!compiled) continue;
        parts.push(compiled.sql);
        params.push(...compiled.params);
      }
      if (parts.length) sql += ` WHERE ${parts.join(" AND ")}`;
    }
    if (options.orderBy && Object.keys(options.orderBy).length) {
      const order = Object.entries(options.orderBy)
        .map(([key, direction]) => `${sqlIdent(key)} ${direction === "desc" ? "DESC" : "ASC"}`)
        .join(", ");
      sql += ` ORDER BY ${order}`;
    }
    if (options.limit != null) sql += ` LIMIT ${Number(options.limit)}`;
    const rows = await this.conn.query(sql, params);
    return rows.map(asRecord);
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.conn.exec("BEGIN");
      try {
        const result = await fn();
        await this.conn.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          await this.conn.exec("ROLLBACK");
        } catch {
          // ignore
        }
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    await this.enqueue(() => this.conn.close());
  }

  private async writableColumns(table: string): Promise<ColumnInfo[]> {
    const columns = await this.tableInfo(table);
    if (columns.length) return columns;
    return systemColumns("INTEGER");
  }
}

function sqlFilter(clause: FilterClause): { sql: string; params: unknown[] } | null {
  const column = sqlIdent(clause.field);
  const op = clause.op ?? "eq";
  switch (op) {
    case "neq":
      return { sql: `${column} != ?`, params: [bindValue(clause.value)] };
    case "contains":
      return { sql: `${column} LIKE ?`, params: [`%${scalarString(clause.value)}%`] };
    case "empty":
      return { sql: `(${column} IS NULL OR ${column} = '')`, params: [] };
    case "not_empty":
      return { sql: `(${column} IS NOT NULL AND ${column} != '')`, params: [] };
    case "in": {
      const values = inValues(clause.value);
      if (!values.length) return null;
      return {
        sql: `${column} IN (${values.map(() => "?").join(", ")})`,
        params: values.map(bindValue),
      };
    }
    case "gt":
      return { sql: `${column} > ?`, params: [bindValue(clause.value)] };
    case "gte":
      return { sql: `${column} >= ?`, params: [bindValue(clause.value)] };
    case "lt":
      return { sql: `${column} < ?`, params: [bindValue(clause.value)] };
    case "lte":
      return { sql: `${column} <= ?`, params: [bindValue(clause.value)] };
    default:
      return { sql: `${column} = ?`, params: [bindValue(clause.value)] };
  }
}

function asRecord(row: Record<string, unknown>): RecordValue {
  return {
    ...row,
    id: scalarString(row.id),
    created_at: scalarString(row.created_at),
    updated_at: scalarString(row.updated_at),
    created_by: scalarString(row.created_by),
    updated_by: scalarString(row.updated_by),
  };
}
