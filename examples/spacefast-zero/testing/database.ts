import { runInNewContext } from "node:vm";
import { compileDeployment } from "../deployment/compile.ts";
import { DatabaseSync } from "node:sqlite";
import type { Deployment, ZeroDatabase, ZeroRange, ZeroRow } from "../deployment/model.ts";

interface Table {
  fields: Record<string, string>;
  indexes: Record<string, string[]>;
}
function schemaTables(deployment: Deployment): Record<string, Table> {
  const scalar = (type: string) => ({
    type,
    optional() {
      return this;
    },
    default() {
      return this;
    },
  });
  return runInNewContext(
    `({${compileDeployment(deployment.spec, deployment.workspaceId).schema}})`,
    {
      string: () => scalar("string"),
      number: () => scalar("number"),
      boolean: () => scalar("boolean"),
      table: (fields: Record<string, { type: string }>) => ({
        fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.type])),
        indexes: {} as Record<string, string[]>,
        index(name: string, columns: string[]) {
          this.indexes[name] = columns;
          return this;
        },
      }),
    },
  ) as Record<string, Table>;
}

/** SQL-backed SDK-shape harness; live HTTP tests separately establish hosted Zero behavior. */
export function database() {
  const sql = new DatabaseSync(":memory:");
  const traces: string[] = [];
  let sequence = 0;
  const install = (deployment: Deployment): ZeroDatabase =>
    Object.fromEntries(
      Object.entries(schemaTables(deployment)).map(([name, collection]) => {
        const columns = [
          ["id", "TEXT"],
          ["createdAt", "TEXT"],
          ["updatedAt", "TEXT"],
          ...Object.entries(collection.fields).map(([column, type]) => [
            column,
            type === "number" ? "REAL" : type === "boolean" ? "INTEGER" : "TEXT",
          ]),
        ];
        const tableName = name;
        sql.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" ("id" TEXT PRIMARY KEY)`);
        const existing = sql
          .prepare(`PRAGMA table_info("${tableName}")`)
          .all()
          .map((row) => row.name);
        for (const [name, type] of columns)
          if (!existing.includes(name))
            sql.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${name}" ${type}`);
        const bind = (value: unknown) =>
          typeof value === "boolean" ? Number(value) : (value as string | number | null);
        const row = (raw: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(raw).map(([key, value]) => [
              key,
              collection.fields[key] === "boolean" && value != null ? !!value : value,
            ]),
          ) as ZeroRow;
        const read = (id: string) => {
          const raw = sql.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(id);
          return raw ? row(raw) : null;
        };
        return [
          tableName,
          {
            async insert(input: object) {
              const value = {
                ...input,
                id: `native-${++sequence}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              const keys = Object.keys(value);
              sql
                .prepare(
                  `INSERT INTO "${tableName}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
                )
                .run(...Object.values(value).map(bind));
              return read(value.id)!;
            },
            async update(id: string, input: object) {
              const keys = Object.keys(input);
              sql
                .prepare(
                  `UPDATE "${tableName}" SET ${keys.map((key) => `"${key}" = ?`).join(",")} WHERE id = ?`,
                )
                .run(...Object.values(input).map(bind), id);
              return read(id);
            },
            async delete(id: string) {
              return sql.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).run(id).changes > 0;
            },
            withIndex(index: string, range: (range: ZeroRange) => ZeroRange) {
              const columns = collection.indexes[index]!;
              let conditions: string[] = [],
                values: unknown[] = [];
              let direction = "asc";
              const builder = Object.fromEntries(
                Object.entries({ eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=" }).map(
                  ([op, symbol]) => [
                    op,
                    (field: string, value: unknown) => {
                      conditions.push(`"${field}" ${symbol} ?`);
                      values.push(value);
                      return builder;
                    },
                  ],
                ),
              ) as unknown as ZeroRange;
              range(builder);
              const run = (count: boolean, limit?: number, offset = 0) => {
                const query =
                  `SELECT ${count ? "COUNT(*) AS n" : "*"} FROM "${tableName}"` +
                  (conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "") +
                  (count
                    ? ""
                    : ` ORDER BY ${columns.map((column) => `"${column}" ${direction}`).join(",")}`) +
                  (limit === undefined ? "" : ` LIMIT ${limit} OFFSET ${offset}`);
                traces.push(query);
                const rows = sql.prepare(query).all(...values.map(bind));
                // The hosted SDK resets its mutable query state after a terminal operation.
                conditions = [];
                values = [];
                return count ? Number(rows[0]!.n) : rows.map(row);
              };
              return {
                order(order: "asc" | "desc") {
                  direction = order;
                  return this;
                },
                async collect() {
                  return run(false) as ZeroRow[];
                },
                async take(limit: number) {
                  return run(false, limit) as ZeroRow[];
                },
                async first() {
                  return (run(false, 1) as ZeroRow[])[0] ?? null;
                },
                async count() {
                  return run(true) as number;
                },
                async paginate(options: { cursor: string | null; numItems: number }) {
                  const offset = options.cursor === null ? 0 : Number(options.cursor);
                  const rows = run(false, options.numItems + 1, offset) as ZeroRow[];
                  const isDone = rows.length <= options.numItems;
                  return {
                    page: rows.slice(0, options.numItems),
                    isDone,
                    continueCursor: isDone ? null : String(offset + options.numItems),
                  };
                },
              };
            },
          },
        ];
      }),
    );
  return { sql, install, traces };
}
