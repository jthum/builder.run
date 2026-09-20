import { createBrowserSqlitePool, type BrowserSqlitePool } from "@jthum/framework-sqlite-browser";
import type { SqliteParameters } from "@jthum/framework/sqlite";

import type { SqlConnection, SqlGateway } from "./gateway.ts";

let connecting: Promise<SqlGateway> | null = null;
let poolRef: BrowserSqlitePool | null = null;

export async function connectWorkerGateway(): Promise<SqlGateway> {
  connecting ??= openWorkerGateway();
  return connecting;
}

async function openWorkerGateway(): Promise<SqlGateway> {
  const pool = await createBrowserSqlitePool({ namespace: "builder-run-sqlite" });
  poolRef = pool;

  return {
    backend: pool.backend,
    attachName: (name: string) => name,
    async open(name: string) {
      const database = await pool.open(name);
      return {
        async exec(sql: string, params: unknown[] = []) {
          if (params.length) await database.run(sql, params as SqliteParameters);
          else await database.execute(sql);
        },
        async query(sql: string, params: unknown[] = []) {
          return database.all(sql, params as SqliteParameters) as Promise<
            Array<Record<string, unknown>>
          >;
        },
        async close() {
          await database.close();
        },
      } satisfies SqlConnection;
    },
    async inspect() {
      const { databases, capacity } = await pool.inspect();
      return { databases, ...(capacity ? { capacity } : {}) };
    },
    async remove(name: string) {
      await pool.remove(name);
    },
    async wipe() {
      await pool.wipe();
      connecting = null;
      poolRef = null;
    },
  };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void poolRef?.close();
    poolRef = null;
    connecting = null;
  });
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
