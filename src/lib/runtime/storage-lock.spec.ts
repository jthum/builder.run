import { describe, expect, it } from "vite-plus/test";
import { isStorageLocked, STORAGE_LOCKED } from "./storage-lock.ts";

describe("storage lock", () => {
  it("detects the locked storage error code", () => {
    expect.hasAssertions();
    expect(isStorageLocked(new Error(STORAGE_LOCKED))).toBe(true);
    expect(isStorageLocked(new Error(`worker: ${STORAGE_LOCKED}`))).toBe(true);
    expect(isStorageLocked(new Error("disk full"))).toBe(false);
  });
});
