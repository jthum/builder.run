import type { PersistenceBackend } from "./persist.ts";

export interface SqlConnection {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface SqlGateway {
  readonly backend: PersistenceBackend;
  open(name: string): Promise<SqlConnection>;
  wipe(): Promise<void>;
}

export async function openSqlGateway(): Promise<SqlGateway> {
  if (typeof window === "undefined") {
    const { createNodeGateway } = await import("./sql-node.ts");
    return createNodeGateway();
  }
  const { connectWorkerGateway } = await import("./sql-browser.ts");
  return connectWorkerGateway();
}
