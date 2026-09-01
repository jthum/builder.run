import { createId } from "./ids.ts";
import { nowIso, type RecordValue } from "./model.ts";
import { type ColumnInfo, type SelectOptions, type TableEngine, systemColumns } from "./engine.ts";
import type { SqlConnection } from "./sql-gateway.ts";
import { bindValue, createTableSql, placeholders, quoteList, sqlIdent } from "./sql.ts";

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
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'br_%' ORDER BY name`,
    );
    return rows.map((row) => String(row.name));
  }

  async tableInfo(table: string): Promise<ColumnInfo[]> {
    const rows = await this.conn.query(`PRAGMA table_info(${sqlIdent(table)})`);
    return rows.map((row) => ({
      name: String(row.name),
      sqlType: String(row.type || "TEXT"),
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

  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    const columns = await this.writableColumns(table);
    const payload: Record<string, unknown> = {
      id: row.id ?? createId("rec"),
      created_at: row.created_at ?? nowIso(),
      updated_at: row.updated_at ?? nowIso(),
      created_by: row.created_by ?? "",
      updated_by: row.updated_by ?? "",
      ...row,
    };
    const names = columns.map((column) => column.name);
    const values = names.map((name) => bindValue(payload[name] ?? null));
    await this.conn.exec(
      `INSERT INTO ${sqlIdent(table)} (${quoteList(names)}) VALUES (${placeholders(names.length)})`,
      values,
    );
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
    if (options.where && Object.keys(options.where).length) {
      const parts = Object.entries(options.where).map(([key, value]) => {
        params.push(bindValue(value));
        return `${sqlIdent(key)} = ?`;
      });
      sql += ` WHERE ${parts.join(" AND ")}`;
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

  async dump(): Promise<Record<string, RecordValue[]>> {
    const data: Record<string, RecordValue[]> = {};
    for (const table of await this.listTables()) {
      data[table] = await this.select(table);
    }
    return data;
  }

  async load(data: Record<string, RecordValue[]>): Promise<void> {
    for (const [table, rows] of Object.entries(data)) {
      const existing = await this.listTables();
      if (!existing.includes(table) && rows[0]) {
        const columns: ColumnInfo[] = Object.keys(rows[0])
          .filter((name) => !systemColumns().some((column) => column.name === name))
          .map((name) => ({ name, sqlType: "TEXT" }));
        await this.createTable(table, columns);
      }
      for (const row of rows) {
        const current = await this.get(table, row.id);
        if (current) await this.update(table, row.id, row);
        else await this.insert(table, row);
      }
    }
  }

  private async writableColumns(table: string): Promise<ColumnInfo[]> {
    const columns = await this.tableInfo(table);
    if (columns.length) return columns;
    return systemColumns();
  }
}

function asRecord(row: Record<string, unknown>): RecordValue {
  return {
    id: String(row.id ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    created_by: String(row.created_by ?? ""),
    updated_by: String(row.updated_by ?? ""),
    ...row,
  };
}
