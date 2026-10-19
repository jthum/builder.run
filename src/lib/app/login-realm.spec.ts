import { describe, expect, it } from "vite-plus/test";
import { readLoginRealm, rememberLoginRealm } from "./login-realm.ts";

describe("Login realm hints", () => {
  it("remembers the issuance realm after navigation and lets links override it", () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
    rememberLoginRealm(storage, "recruiting");
    expect(readLoginRealm(storage, "")).toBe("recruiting");
    expect(readLoginRealm(storage, "?realm=another-space")).toBe("another-space");
    expect(readLoginRealm(storage, "?realm=")).toBeUndefined();
    expect(value).toBe("recruiting");
  });
  it("tolerates unavailable preference storage", () => {
    const unavailable = () => {
      throw new Error("Storage disabled");
    };
    expect(readLoginRealm({ getItem: unavailable }, "")).toBeUndefined();
    expect(readLoginRealm({ getItem: unavailable }, "?realm=recruiting")).toBe("recruiting");
    expect(() => rememberLoginRealm({ setItem: unavailable }, "recruiting")).not.toThrow();
  });
});
