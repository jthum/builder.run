import type { PersistenceBackend } from "./persist.ts";
import type { SqlConnection, SqlGateway } from "./sql-gateway.ts";

type RpcResult = {
  id: number;
  result?: unknown;
  error?: string;
};

export async function connectWorkerGateway(): Promise<SqlGateway> {
  const worker = new Worker(new URL("./sqlite-worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;

  worker.addEventListener("message", (event: MessageEvent<RpcResult>) => {
    const waiter = pending.get(event.data.id);
    if (!waiter) return;
    pending.delete(event.data.id);
    if (event.data.error) waiter.reject(new Error(event.data.error));
    else waiter.resolve(event.data.result);
  });
  worker.addEventListener("error", (event) => {
    for (const waiter of pending.values())
      waiter.reject(event.error ?? new Error("SQLite worker failed"));
    pending.clear();
  });

  function rpc(payload: Record<string, unknown>): Promise<unknown> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...payload });
    });
  }

  const init = (await rpc({ method: "init" })) as { backend: PersistenceBackend };

  return {
    backend: init.backend,
    async open(name: string) {
      await rpc({ method: "open", db: name });
      return {
        async exec(sql: string, params: unknown[] = []) {
          await rpc({ method: "exec", db: name, sql, params });
        },
        async query(sql: string, params: unknown[] = []) {
          return (await rpc({ method: "query", db: name, sql, params })) as Array<
            Record<string, unknown>
          >;
        },
        async close() {
          await rpc({ method: "close", db: name });
        },
      } satisfies SqlConnection;
    },
  };
}
