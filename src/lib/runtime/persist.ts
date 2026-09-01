export type PersistenceBackend = "opfs" | "indexeddb" | "memory";

const IDB_NAME = "builder-run";
const IDB_STORE = "kv";
const OPFS_FILE = "builder-run-platform.json";

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

export async function writePlatformJson(backend: PersistenceBackend, json: string): Promise<void> {
  if (backend === "opfs") {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(OPFS_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
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
