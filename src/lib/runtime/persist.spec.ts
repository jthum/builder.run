import { describe, expect, it } from "vite-plus/test";
import { readPlatformJson, wipeLocalData, writePlatformJson } from "./persist.ts";

describe("persist wipe", () => {
  it("clears the in-memory platform json slot", async () => {
    expect.hasAssertions();
    await writePlatformJson("memory", "{}");
    expect(await readPlatformJson("memory")).toBe("{}");
    await wipeLocalData();
    expect(await readPlatformJson("memory")).toBeNull();
  });
});
