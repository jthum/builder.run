import { describe, expect, it } from "vite-plus/test";
import { readSelection, writeSelection } from "./selection.ts";

describe("App selection preferences", () => {
  it("round trips navigation identifiers", () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
    const selection = { spaceId: "space", appId: "app" };
    writeSelection(storage, selection);
    expect(readSelection(storage)).toEqual(selection);
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
