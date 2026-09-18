import type { PersistenceBackend } from "./browser-storage.ts";

export interface SqlConnection {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface SqlGateway {
  readonly backend: PersistenceBackend;
  open(name: string): Promise<SqlConnection>;
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
