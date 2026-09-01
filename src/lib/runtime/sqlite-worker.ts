// @ts-nocheck
/// <reference types="webmcp-types" />
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { Factory } from "wa-sqlite";
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { MemoryAsyncVFS } from "wa-sqlite/src/examples/MemoryAsyncVFS.js";
import wasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";

type Request = {
  id: number;
  method: "open" | "exec" | "query" | "close";
  db: string;
  sql?: string;
  params?: unknown[];
};

type SqliteApi = ReturnType<typeof Factory>;

let sqlite3: SqliteApi | null = null;
let vfsName = "memory";
const dbs = new Map<string, number>();

async function api(): Promise<SqliteApi> {
  if (sqlite3) return sqlite3;
  const module = await SQLiteESMFactory({
    locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file),
  });
  sqlite3 = Factory(module);
  try {
    const vfs = await IDBBatchAtomicVFS.create("builder-run-idb", module);
    sqlite3.vfs_register(vfs, true);
    vfsName = "indexeddb";
  } catch {
    const vfs = await MemoryAsyncVFS.create("builder-run-memory", module);
    sqlite3.vfs_register(vfs, true);
    vfsName = "memory";
  }
  return sqlite3;
}

async function openDb(name: string): Promise<number> {
  const existing = dbs.get(name);
  if (existing != null) return existing;
  const sqlite = await api();
  const db = await sqlite.open_v2(name);
  dbs.set(name, db);
  return db;
}

async function bind(sqlite: SqliteApi, stmt: number, params: unknown[]): Promise<void> {
  for (let i = 0; i < params.length; i += 1) {
    const value = params[i];
    const index = i + 1;
    if (value == null) sqlite.bind_null(stmt, index);
    else if (typeof value === "number") sqlite.bind_double(stmt, index, value);
    else if (typeof value === "boolean") sqlite.bind_int(stmt, index, value ? 1 : 0);
    else sqlite.bind_text(stmt, index, String(value));
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, method, db, sql, params } = event.data;
  try {
    if (method === "open") {
      await openDb(db);
      self.postMessage({ id, result: { vfs: vfsName } });
      return;
    }
    if (method === "close") {
      const sqlite = await api();
      const handle = dbs.get(db);
      if (handle != null) {
        await sqlite.close(handle);
        dbs.delete(db);
      }
      self.postMessage({ id, result: true });
      return;
    }
    const sqlite = await api();
    const handle = await openDb(db);
    if (method === "exec") {
      await sqlite.exec(handle, sql ?? "");
      self.postMessage({ id, result: true });
      return;
    }
    const rows: Array<Record<string, unknown>> = [];
    for await (const stmt of sqlite.statements(handle, sql ?? "")) {
      await bind(sqlite, stmt, params ?? []);
      const columns = sqlite.column_names(stmt);
      while ((await sqlite.step(stmt)) === 100) {
        const row: Record<string, unknown> = {};
        columns.forEach((column, index) => {
          row[column] = sqlite.column(stmt, index);
        });
        rows.push(row);
      }
    }
    self.postMessage({ id, result: rows });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
