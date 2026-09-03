/** How SQLite pages are stored. Not the application record format. */
export type PersistenceBackend = "opfs" | "indexeddb" | "memory";

const IDB_NAME = "builder-run";
const IDB_STORE = "kv";
const OPFS_FILE = "builder-run-platform.json";
const SQLITE_OPFS_DIR = "builder-run-sqlite";
const SQLITE_IDB_NAME = "builder-run-sqlite";

export async function detectBackend(): Promise<PersistenceBackend> {
  if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    try {
      await navigator.storage.getDirectory();
      return "opfs";
    } catch {
      // fall through
    }
  }
  if (typeof indexedDB !== "undefined") return "indexeddb";
  return "memory";
}

export async function readPlatformJson(backend: PersistenceBackend): Promise<string | null> {
  if (backend === "opfs") {
    try {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(OPFS_FILE);
      const file = await handle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }
  if (backend === "indexeddb") {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get("platform");
      request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  return memorySlot;
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export async function writePlatformJson(backend: PersistenceBackend, json: string): Promise<void> {
  if (backend === "opfs") {
    const root = await navigator.storage.getDirectory();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await root.removeEntry(OPFS_FILE).catch(() => undefined);
        const handle = await root.getFileHandle(OPFS_FILE, { create: true });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return;
      } catch (error) {
        if (attempt === 0 && isNotFound(error)) continue;
        throw error;
      }
    }
    return;
  }
  if (backend === "indexeddb") {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(json, "platform");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  }
  memorySlot = json;
}

let memorySlot: string | null = null;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function resetMemorySlot(): void {
  memorySlot = null;
}

export async function wipeLocalData(): Promise<void> {
  resetMemorySlot();
  if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      await Promise.all([
        root.removeEntry(OPFS_FILE).catch(() => undefined),
        root.removeEntry(SQLITE_OPFS_DIR, { recursive: true }).catch(() => undefined),
      ]);
    } catch {
      // OPFS unavailable
    }
  }
  if (typeof indexedDB === "undefined") return;
  const names = new Set([IDB_NAME, SQLITE_IDB_NAME]);
  if (typeof indexedDB.databases === "function") {
    try {
      for (const info of await indexedDB.databases()) {
        if (info.name?.startsWith("builder-run")) names.add(info.name);
      }
    } catch {
      // Safari may not support databases()
    }
  }
  await Promise.all([...names].map(deleteIndexedDb));
}

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
