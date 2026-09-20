import { DatabaseSync } from "node:sqlite";
import type { PersistenceBackend, SqlConnection, SqlGateway } from "./gateway.ts";
import { bindValue } from "./sql.ts";

class NodeConnection implements SqlConnection {
  constructor(private readonly db: DatabaseSync) {}

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    if (!params.length) {
      this.db.exec(sql);
      return;
    }
    this.db.prepare(sql).run(...params.map(bindValue));
  }

  async query(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    const stmt = this.db.prepare(sql);
    const rows = params.length ? stmt.all(...params.map(bindValue)) : stmt.all();
    return (rows as Array<Record<string, unknown>>).map(normalizeRow);
  }

  async close(): Promise<void> {
    // The gateway owns the shared in-memory database. Closing one logical
    // connection must not destroy data that a later Host instance reopens.
  }
}

export function createNodeGateway(): SqlGateway {
  const dbs = new Map<string, DatabaseSync>();
  return {
    backend: "memory" satisfies PersistenceBackend,
    async open(name: string) {
      let db = dbs.get(name);
      if (!db) {
        db = new DatabaseSync(":memory:");
        dbs.set(name, db);
      }
      return new NodeConnection(db);
    },
    async inspect() {
      return {
        databases: [...dbs.keys()]
          .sort((left, right) => left.localeCompare(right))
          .map((name) => ({ name, open: true })),
      };
    },
    async remove(name: string) {
      const db = dbs.get(name);
      if (!db) return;
      try {
        db.close();
      } catch {
        // already closed
      }
      dbs.delete(name);
    },
    async wipe() {
      for (const db of dbs.values()) {
        try {
          db.close();
        } catch {
          // already closed
        }
      }
      dbs.clear();
    },
  };
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    next[key] = typeof value === "bigint" ? Number(value) : value;
  }
  return next;
}
