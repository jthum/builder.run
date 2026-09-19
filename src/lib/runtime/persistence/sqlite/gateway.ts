import type { PersistenceBackend } from "./browser-storage.ts";

export interface SqlConnection {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface SqlDatabaseDiagnostic {
  readonly name: string;
  readonly bytes?: number;
  readonly open: boolean;
}

export interface SqlGatewayDiagnostics {
  readonly databases: readonly SqlDatabaseDiagnostic[];
  readonly capacity?: {
    readonly used: number;
    readonly total: number;
  };
}

export interface SqlGateway {
  readonly backend: PersistenceBackend;
  /** SQLite-visible name for ATTACH, when logical databases are independently attachable. */
  attachName?(name: string): string | undefined;
  open(name: string): Promise<SqlConnection>;
  inspect(): Promise<SqlGatewayDiagnostics>;
  /** Remove one closed logical database. Missing databases are a successful no-op. */
  remove(name: string): Promise<void>;
  wipe(): Promise<void>;
}

export async function openSqlGateway(): Promise<SqlGateway> {
  if (typeof window === "undefined") {
    const { createNodeGateway } = await import("./node-gateway.ts");
    return createNodeGateway();
  }
  const { connectWorkerGateway } = await import("./browser-gateway.ts");
  return connectWorkerGateway();
}
