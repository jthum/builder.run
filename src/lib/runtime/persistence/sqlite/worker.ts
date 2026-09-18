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
const OPFS_INITIAL_CAPACITY = 24;
const OPFS_CAPACITY_INCREMENT = 24;
const OPFS_MIN_HEADROOM = 4;
const OPFS_HEADER_PATH_BYTES = 512;
const OPFS_HEADER_BYTES = 4096;

let sqlite3 = null;
let backend = "memory";
let selectedVfs = null;
let vfsInstance = null;
const dbs = new Map();
const activeTransactions = new Set();

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
      const extra = OPFS_INITIAL_CAPACITY - vfs.getCapacity();
      if (extra > 0) await vfs.addCapacity(extra);
      sqlite.vfs_register(vfs, false);
      await probe(sqlite, vfs.name, vfs);
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
      await probe(sqlite, vfs.name, vfs);
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

async function probe(sqlite, vfsName, vfs) {
  const name = "__builder_run_probe__";
  const db = await sqlite.open_v2(name, undefined, vfsName);
  try {
    await sqlite.exec(
      db,
      "CREATE TABLE IF NOT EXISTS probe (id TEXT); DROP TABLE IF EXISTS probe;",
    );
  } finally {
    await sqlite.close(db);
    await vfs.xDelete?.(name, 1);
  }
}

async function openDb(name) {
  const sqlite = await boot();
  await ensureOpfsHeadroom();
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

async function ensureOpfsHeadroom() {
  if (
    backend !== "opfs" ||
    !vfsInstance ||
    typeof vfsInstance.getSize !== "function" ||
    typeof vfsInstance.getCapacity !== "function" ||
    typeof vfsInstance.reset !== "function" ||
    typeof vfsInstance.addCapacity !== "function" ||
    activeTransactions.size > 0 ||
    vfsInstance.getCapacity() - vfsInstance.getSize() > OPFS_MIN_HEADROOM
  )
    return;

  for (const handle of dbs.values()) await sqlite3.close(handle);
  dbs.clear();
  await vfsInstance.reset();
  await vfsInstance.addCapacity(OPFS_CAPACITY_INCREMENT);
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
  trackTransaction(dbName, sql);
}

function trackTransaction(dbName, sql) {
  const statement = String(sql).trim().toUpperCase();
  if (/^BEGIN\b/.test(statement)) activeTransactions.add(dbName);
  else if (/^(?:COMMIT|END|ROLLBACK)\b/.test(statement)) activeTransactions.delete(dbName);
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
    activeTransactions.clear();
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
  activeTransactions.delete(name);
  if (vfsInstance?.xDelete) await vfsInstance.xDelete(name, 1);
}

async function inspectStorage() {
  const databases =
    backend === "opfs"
      ? await inspectOpfsDatabases()
      : [...dbs.keys()]
          .sort((left, right) => left.localeCompare(right))
          .map((name) => ({ name, open: true }));
  const capacity =
    typeof vfsInstance?.getSize === "function" && typeof vfsInstance?.getCapacity === "function"
      ? { used: vfsInstance.getSize(), total: vfsInstance.getCapacity() }
      : undefined;
  return { databases, ...(capacity ? { capacity } : {}) };
}

async function inspectOpfsDatabases() {
  const root = await navigator.storage.getDirectory();
  let directory = root;
  for (const part of OPFS_DIR.split("/").filter(Boolean))
    directory = await directory.getDirectoryHandle(part);

  const open = new Set(dbs.keys());
  const databases = [];
  for await (const [, handle] of directory.entries()) {
    if (handle.kind !== "file") continue;
    const file = await handle.getFile();
    const header = new Uint8Array(await file.slice(0, OPFS_HEADER_PATH_BYTES).arrayBuffer());
    const terminator = header.indexOf(0);
    const path = new TextDecoder().decode(
      header.subarray(0, terminator < 0 ? OPFS_HEADER_PATH_BYTES : terminator),
    );
    if (!path) continue;
    const name = path.replace(/^\//, "");
    databases.push({
      name,
      bytes: Math.max(0, file.size - OPFS_HEADER_BYTES),
      open: open.has(name),
    });
  }
  return databases.sort((left, right) => left.name.localeCompare(right.name));
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
    if (method === "inspect") {
      await boot();
      self.postMessage({ id, result: await inspectStorage() });
      return;
    }
    if (method === "close") {
      const sqlite = await boot();
      const handle = dbs.get(db);
      if (handle != null) {
        await sqlite.close(handle);
        dbs.delete(db);
      }
      activeTransactions.delete(db);
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
