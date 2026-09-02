// @ts-nocheck
import SQLiteAsyncFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import SQLiteSyncFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import { Factory, SQLITE_ROW } from "wa-sqlite";
import { AccessHandlePoolVFS } from "wa-sqlite/src/examples/AccessHandlePoolVFS.js";
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { MemoryAsyncVFS } from "wa-sqlite/src/examples/MemoryAsyncVFS.js";
import asyncWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import syncWasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";

const OPFS_DIR = "/builder-run-sqlite";
const OPFS_CAPACITY = 24;

let sqlite3 = null;
let backend = "memory";
let selectedVfs = null;
const dbs = new Map();

async function boot() {
  if (sqlite3) return sqlite3;
  const opfs = await tryOpfs();
  if (opfs) {
    sqlite3 = opfs.sqlite;
    backend = "opfs";
    selectedVfs = opfs.vfsName;
    return sqlite3;
  }
  const module = await SQLiteAsyncFactory({
    locateFile: (file) => (String(file).endsWith(".wasm") ? asyncWasmUrl : file),
  });
  sqlite3 = Factory(module);
  backend = await registerAsyncVfs(sqlite3);
  return sqlite3;
}

async function tryOpfs() {
  if (!globalThis.navigator?.storage?.getDirectory) return null;
  try {
    const module = await SQLiteSyncFactory({
      locateFile: (file) => (String(file).endsWith(".wasm") ? syncWasmUrl : file),
    });
    const sqlite = Factory(module);
    const vfs = new AccessHandlePoolVFS(OPFS_DIR);
    await vfs.isReady;
    const extra = OPFS_CAPACITY - vfs.getCapacity();
    if (extra > 0) await vfs.addCapacity(extra);
    sqlite.vfs_register(vfs, false);
    await probe(sqlite, vfs.name);
    return { sqlite, vfsName: vfs.name };
  } catch (error) {
    console.warn("builder.run opfs SQLite unavailable", error);
    return null;
  }
}

async function registerAsyncVfs(sqlite) {
  const candidates = [];
  if (typeof indexedDB !== "undefined") {
    candidates.push({
      backend: "indexeddb",
      create: () => new IDBBatchAtomicVFS("builder-run-sqlite"),
    });
  }
  candidates.push({
    backend: "memory",
    create: () => new MemoryAsyncVFS(),
  });

  let lastError;
  for (const candidate of candidates) {
    try {
      const vfs = candidate.create();
      if (vfs.isReady) await vfs.isReady;
      sqlite.vfs_register(vfs, false);
      await probe(sqlite, vfs.name);
      selectedVfs = vfs.name;
      return candidate.backend;
    } catch (error) {
      lastError = error;
      console.warn(`builder.run ${candidate.backend} SQLite unavailable`, error);
    }
  }
  throw lastError ?? new Error("No SQLite VFS could be registered");
}

async function probe(sqlite, vfsName) {
  const db = await sqlite.open_v2("__builder_run_probe__", undefined, vfsName);
  try {
    await sqlite.exec(
      db,
      "CREATE TABLE IF NOT EXISTS probe (id TEXT); DROP TABLE IF EXISTS probe;",
    );
  } finally {
    await sqlite.close(db);
  }
}

async function openDb(name) {
  const sqlite = await boot();
  const existing = dbs.get(name);
  if (existing != null) return existing;
  const db = await sqlite.open_v2(name, undefined, selectedVfs);
  dbs.set(name, db);
  return db;
}

function bindParams(sqlite, stmt, params) {
  if (!params?.length) return;
  if (typeof sqlite.bind_collection === "function") {
    sqlite.bind_collection(stmt, params);
    return;
  }
  params.forEach((value, index) => {
    const at = index + 1;
    if (value == null) sqlite.bind_null(stmt, at);
    else if (typeof value === "number") sqlite.bind_double(stmt, at, value);
    else if (typeof value === "boolean") sqlite.bind_int(stmt, at, value ? 1 : 0);
    else sqlite.bind_text(stmt, at, String(value));
  });
}

async function run(dbName, sql, params = []) {
  const sqlite = await boot();
  const db = await openDb(dbName);
  for await (const stmt of sqlite.statements(db, sql)) {
    bindParams(sqlite, stmt, params);
    while ((await sqlite.step(stmt)) === SQLITE_ROW) {
      // drain
    }
  }
}

async function query(dbName, sql, params = []) {
  const sqlite = await boot();
  const db = await openDb(dbName);
  const rows = [];
  for await (const stmt of sqlite.statements(db, sql)) {
    bindParams(sqlite, stmt, params);
    const columns = sqlite.column_names(stmt);
    while ((await sqlite.step(stmt)) === SQLITE_ROW) {
      const values = sqlite.row(stmt);
      const row = {};
      columns.forEach((column, index) => {
        row[column] = values[index];
      });
      rows.push(row);
    }
  }
  return rows;
}

self.addEventListener("unhandledrejection", (event) => {
  console.warn("builder.run sqlite worker", event.reason);
  event.preventDefault();
});

async function handleMessage(event) {
  const { id, method, db, sql, params } = event.data;
  try {
    if (method === "init") {
      await boot();
      self.postMessage({ id, result: { backend } });
      return;
    }
    if (method === "open") {
      await openDb(db);
      self.postMessage({ id, result: { backend } });
      return;
    }
    if (method === "close") {
      const sqlite = await boot();
      const handle = dbs.get(db);
      if (handle != null) {
        await sqlite.close(handle);
        dbs.delete(db);
      }
      self.postMessage({ id, result: true });
      return;
    }
    if (method === "exec") {
      await run(db, sql ?? "", params ?? []);
      self.postMessage({ id, result: true });
      return;
    }
    if (method === "query") {
      const rows = await query(db, sql ?? "", params ?? []);
      self.postMessage({ id, result: rows });
      return;
    }
    throw new Error(`Unknown SQLite worker method ${method}`);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
}

let chain = Promise.resolve();
self.onmessage = (event) => {
  chain = chain.then(
    () => handleMessage(event),
    () => handleMessage(event),
  );
};
