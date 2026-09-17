import { SqlitePersistenceAdapter } from "@jthum/framework/sqlite";
import type {
  SqliteConnection as FrameworkSqliteConnection,
  SqliteDatabase,
  SqliteParameters,
} from "@jthum/framework/sqlite";
import type {
  SqlConnection as BuilderSqlConnection,
  SqlGateway,
} from "$lib/runtime/persistence/sqlite/gateway.ts";

export const BUILDER_KERNEL_DATABASE = "builder-framework";
const activeDatabases = new WeakMap<SqlGateway, Set<string>>();

/**
 * Uses Builder's environment-specific SQLite gateway as Framework persistence.
 *
 * The gateway selects wa-sqlite in the browser and node:sqlite in tests. This adapter owns only
 * transaction ordering and the small difference between the two SQL interfaces; it does not
 * depend on Builder's legacy Host, catalog, or record services.
 */
export function createKernelSqlitePersistence(
  gateway: SqlGateway,
  databaseName = BUILDER_KERNEL_DATABASE,
): SqlitePersistenceAdapter {
  return new SqlitePersistenceAdapter(async () => {
    acquireDatabase(gateway, databaseName);
    try {
      const connection = await gateway.open(databaseName);
      return new GatewaySqliteDatabase(connection, () => {
        releaseDatabase(gateway, databaseName);
      });
    } catch (error) {
      releaseDatabase(gateway, databaseName);
      throw error;
    }
  });
}

function acquireDatabase(gateway: SqlGateway, name: string): void {
  const names = activeDatabases.get(gateway) ?? new Set<string>();
  if (names.has(name)) {
    throw new Error("Builder Kernel SQLite persistence already has an active session.");
  }
  names.add(name);
  activeDatabases.set(gateway, names);
}

function releaseDatabase(gateway: SqlGateway, name: string): void {
  const names = activeDatabases.get(gateway);
  names?.delete(name);
  if (names?.size === 0) activeDatabases.delete(gateway);
}

class GatewaySqliteDatabase implements SqliteDatabase {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly connection: BuilderSqlConnection,
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

  transaction<T>(work: (connection: FrameworkSqliteConnection) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const connection = new DirectSqliteConnection(this.connection);
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

class DirectSqliteConnection implements FrameworkSqliteConnection {
  constructor(private readonly connection: BuilderSqlConnection) {}

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
