// @ts-nocheck
import SQLiteAsyncFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import SQLiteSyncFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import { Factory, SQLITE_ROW } from "wa-sqlite";
import { AccessHandlePoolVFS } from "wa-sqlite/src/examples/AccessHandlePoolVFS.js";
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { MemoryAsyncVFS } from "wa-sqlite/src/examples/MemoryAsyncVFS.js";
import asyncWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import syncWasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";
import { STORAGE_LOCKED } from "./storage-lock.ts";

const OPFS_DIR = "/builder-run-sqlite";
const OPFS_CAPACITY = 24;

let sqlite3 = null;
let backend = "memory";
let selectedVfs = null;
let vfsInstance = null;
const dbs = new Map();

async function boot() {
  if (sqlite3) return sqlite3;
  const opfs = await tryOpfs();
  if (opfs) {
    sqlite3 = opfs.sqlite;
    backend = "opfs";
    selectedVfs = opfs.vfsName;
    vfsInstance = opfs.vfs;
    return sqlite3;
  }
  const module = await SQLiteAsyncFactory({
    locateFile: (file) => (String(file).endsWith(".wasm") ? asyncWasmUrl : file),
  });
  sqlite3 = Factory(module);
  backend = await registerAsyncVfs(sqlite3);
  return sqlite3;
}

function isOpfsLockError(error) {
  if (!error) return false;
  const name = error.name ?? "";
  const message = String(error.message ?? error);
  return (
    name === "NoModificationAllowedError" ||
    name === "InvalidStateError" ||
    name === "InvalidAccessError" ||
    /access handle|already (?:open|opened)|exclusiv|locked|busy/i.test(message)
  );
}

async function tryOpfs() {
  if (!globalThis.navigator?.storage?.getDirectory) return null;
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
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
      return { sqlite, vfsName: vfs.name, vfs };
    } catch (error) {
      lastError = error;
      if (!isOpfsLockError(error) || attempt === 7) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  if (isOpfsLockError(lastError)) {
    console.warn("builder.run opfs SQLite locked; not falling back to IndexedDB", lastError);
    throw new Error(STORAGE_LOCKED);
  }
  console.warn("builder.run opfs SQLite unavailable", lastError);
  return null;
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
      vfsInstance = vfs;
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
  let db;
  try {
    db = await sqlite.open_v2(name, undefined, selectedVfs);
  } catch (error) {
    const usage =
      typeof vfsInstance?.getSize === "function" && typeof vfsInstance?.getCapacity === "function"
        ? ` (${vfsInstance.getSize()}/${vfsInstance.getCapacity()} files in use)`
        : "";
    throw new Error(
      `Could not open SQLite database ${JSON.stringify(name)} on ${backend}${usage}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
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

async function closeAll() {
  if (sqlite3) {
    for (const handle of dbs.values()) {
      try {
        await sqlite3.close(handle);
      } catch (error) {
        console.warn("builder.run sqlite close", error);
      }
    }
    dbs.clear();
  }
  if (vfsInstance && typeof vfsInstance.close === "function") {
    try {
      await vfsInstance.close();
    } catch (error) {
      console.warn("builder.run vfs close", error);
    }
  }
  vfsInstance = null;
  selectedVfs = null;
  sqlite3 = null;
  backend = "memory";
}

async function removeOpfsTree(path) {
  if (!globalThis.navigator?.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  const top = String(path).split("/").filter(Boolean)[0];
  if (!top) return;
  try {
    await root.removeEntry(top, { recursive: true });
  } catch (error) {
    if (error?.name !== "NotFoundError") {
      console.warn("builder.run opfs wipe", error);
    }
  }
}

async function wipe() {
  await closeAll();
  await removeOpfsTree(OPFS_DIR);
}

async function removeDb(name) {
  const sqlite = await boot();
  const handle = dbs.get(name);
  if (handle != null) {
    await sqlite.close(handle);
    dbs.delete(name);
  }
  if (vfsInstance?.xDelete) await vfsInstance.xDelete(name, 1);
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
    if (method === "wipe") {
      await wipe();
      self.postMessage({ id, result: true });
      return;
    }
    if (method === "remove") {
      await removeDb(db);
      self.postMessage({ id, result: true });
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
