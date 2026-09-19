import { describe, expect, it } from "vite-plus/test";
import { browserSecrets } from "./secrets.ts";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("browser SecretStore", () => {
  it("stores and deletes an opaque secret reference", async () => {
    const target = storage();
    const secrets = browserSecrets(target);
    await secrets.set("workspace/app/setting/api_key", "private");
    expect(await secrets.get("workspace/app/setting/api_key")).toBe("private");
    expect(target.length).toBe(1);
    await secrets.delete("workspace/app/setting/api_key");
    expect(await secrets.get("workspace/app/setting/api_key")).toBeNull();
  });
});
