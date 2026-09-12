/** How SQLite pages are stored. Not the application record format. */
export type PersistenceBackend = "opfs" | "indexeddb" | "memory";

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

export async function wipeLocalData(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(SQLITE_OPFS_DIR, { recursive: true }).catch(() => undefined);
    } catch {
      // OPFS unavailable
    }
  }
  if (typeof indexedDB === "undefined") return;
  const names = new Set([SQLITE_IDB_NAME]);
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
