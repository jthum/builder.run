import { SqlitePersistenceAdapter } from "@jthum/framework/sqlite";
import type { SqliteConnection, SqliteDatabase, SqliteParameters } from "@jthum/framework/sqlite";
import type { SqlConnection, SqlGateway } from "$lib/runtime/persistence/sqlite/gateway.ts";

export const CATALOG_DATABASE = "catalog.db";
const leasedDatabaseNames = new WeakMap<SqlGateway, Set<string>>();

/**
 * Uses Builder.run's environment-specific SQLite gateway as Framework persistence.
 *
 * The gateway selects wa-sqlite in the browser and node:sqlite in tests. This adapter owns only
 * transaction ordering and the small difference between the two SQL interfaces; it does not
 * depend on product catalog or record services.
 */
export function createKernelSqlitePersistence(
  gateway: SqlGateway,
  databaseName = CATALOG_DATABASE,
): SqlitePersistenceAdapter {
  const openDatabase = async (name: string): Promise<SqliteDatabase> => {
    acquireDatabaseLease(gateway, name);
    try {
      const connection = await gateway.open(name);
      return new GatewaySqliteDatabase(gateway.attachName?.(name), connection, () => {
        releaseDatabaseLease(gateway, name);
      });
    } catch (error) {
      releaseDatabaseLease(gateway, name);
      throw error;
    }
  };
  return new SqlitePersistenceAdapter(() => openDatabase(databaseName), {
    workspaceDatabases: {
      open: ({ workspaceId }) => openDatabase(workspaceDatabaseName(workspaceId, databaseName)),
      remove: ({ workspaceId }) => gateway.remove(workspaceDatabaseName(workspaceId, databaseName)),
    },
    scopeDatabases: {
      open: ({ workspaceId, scope }) =>
        openDatabase(scopeDatabaseName(workspaceId, scope.kind, scope.id, databaseName)),
      remove: ({ workspaceId, scope }) =>
        gateway.remove(scopeDatabaseName(workspaceId, scope.kind, scope.id, databaseName)),
    },
  });
}

export function workspaceDatabaseName(workspaceId: string, catalogName = CATALOG_DATABASE): string {
  return routedDatabaseName(catalogName, "w", workspaceId);
}

export function scopeDatabaseName(
  workspaceId: string,
  kind: string,
  id: string,
  catalogName = CATALOG_DATABASE,
): string {
  return routedDatabaseName(catalogName, "s", [workspaceId, kind, id]);
}

function databasePrefix(catalogName: string): string {
  const stem = catalogName.endsWith(".db") ? catalogName.slice(0, -3) : catalogName;
  return (
    stem
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 12) || "db"
  );
}

function routedDatabaseName(
  catalogName: string,
  kind: "w" | "s",
  identity: string | readonly string[],
): string {
  const digest = fnv1a128(JSON.stringify([catalogName, kind, identity]));
  return `${databasePrefix(catalogName)}-${kind}-${digest}.db`;
}

function fnv1a128(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const mask = (1n << 128n) - 1n;
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x0000000001000000000000000000013bn) & mask;
  }
  return hash.toString(16).padStart(32, "0");
}

function acquireDatabaseLease(gateway: SqlGateway, name: string): void {
  const names = leasedDatabaseNames.get(gateway) ?? new Set<string>();
  if (names.has(name)) {
    throw new Error("Runtime SQLite persistence already has an active session.");
  }
  names.add(name);
  leasedDatabaseNames.set(gateway, names);
}

function releaseDatabaseLease(gateway: SqlGateway, name: string): void {
  const names = leasedDatabaseNames.get(gateway);
  names?.delete(name);
  if (names?.size === 0) leasedDatabaseNames.delete(gateway);
}

class GatewaySqliteDatabase implements SqliteDatabase {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    readonly name: string | undefined,
    private readonly connection: SqlConnection,
    private readonly release: () => void,
  ) {}

  execute(sql: string): Promise<void> {
    return this.enqueue(() => this.connection.exec(sql));
  }

  run(sql: string, parameters: SqliteParameters = []): Promise<void> {
    return this.enqueue(() => this.connection.exec(sql, [...parameters]));
  }

  get<T extends object>(sql: string, parameters: SqliteParameters = []): Promise<T | null> {
    return this.enqueue(async () => {
      const rows = await this.connection.query(sql, [...parameters]);
      return (rows[0] as T | undefined) ?? null;
    });
  }

  all<T extends object>(sql: string, parameters: SqliteParameters = []): Promise<T[]> {
    return this.enqueue(async () => (await this.connection.query(sql, [...parameters])) as T[]);
  }

  transaction<T>(work: (connection: SqliteConnection) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const connection = new TransactionSqliteConnection(this.connection);
      await connection.execute("BEGIN");
      try {
        const result = await work(connection);
        await connection.execute("COMMIT");
        return result;
      } catch (error) {
        try {
          await connection.execute("ROLLBACK");
        } catch {
          // Preserve the work error when rollback also fails.
        }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    return this.enqueue(async () => {
      if (this.closed) return;
      try {
        await this.connection.close();
      } finally {
        this.closed = true;
        this.release();
      }
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

class TransactionSqliteConnection implements SqliteConnection {
  constructor(private readonly connection: SqlConnection) {}

  execute(sql: string): Promise<void> {
    return this.connection.exec(sql);
  }

  run(sql: string, parameters: SqliteParameters = []): Promise<void> {
    return this.connection.exec(sql, [...parameters]);
  }

  async get<T extends object>(sql: string, parameters: SqliteParameters = []): Promise<T | null> {
    const rows = await this.connection.query(sql, [...parameters]);
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T extends object>(sql: string, parameters: SqliteParameters = []): Promise<T[]> {
    return (await this.connection.query(sql, [...parameters])) as T[];
  }
}
