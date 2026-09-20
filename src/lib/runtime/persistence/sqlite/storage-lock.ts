import { BROWSER_SQLITE_LOCKED } from "@jthum/framework-sqlite-browser";

/** Stable browser SQLite error code used when storage cannot acquire its exclusive lock. */
export const STORAGE_LOCKED = BROWSER_SQLITE_LOCKED;

const RELOAD_KEY = "builder-run:storage-locked-reload";

export function isStorageLocked(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return text.includes(STORAGE_LOCKED);
}

export function clearStorageLockReload(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // private mode
  }
}

/** True if this tab should reload now. False if a reload already failed. */
export function takeStorageLockReload(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.removeItem(RELOAD_KEY);
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
