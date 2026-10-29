import { describe, expect, it } from "vite-plus/test";
import { readSelection, writeSelection } from "./selection.ts";

describe("App selection preferences", () => {
  it("keeps local and server navigation preferences independent", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const local = { spaceId: "local", appId: "local-app" };
    const remote = { spaceId: "server", appId: "server-app" };
    writeSelection(storage, local);
    writeSelection(storage, remote, "server-app-selection");
    expect(readSelection(storage)).toEqual(local);
    expect(readSelection(storage, "server-app-selection")).toEqual(remote);
  });

  it("ignores malformed preferences", () => {
    for (const value of [null, "broken", "{}", '{"spaceId":1,"appId":"app"}'])
      expect(readSelection({ getItem: () => value })).toBeUndefined();
  });

  it("tolerates unavailable browser storage", () => {
    const unavailable = () => {
      throw new Error("Storage disabled");
    };
    expect(readSelection({ getItem: unavailable })).toBeUndefined();
    expect(() =>
      writeSelection({ setItem: unavailable }, { spaceId: "space", appId: "app" }),
    ).not.toThrow();
  });
});
