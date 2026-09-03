import { describe, expect, it } from "vite-plus/test";
import { cloneData } from "./model.ts";

describe("cloneData", () => {
  it("unwraps proxies into structured-cloneable objects", () => {
    expect.hasAssertions();
    const proxied = new Proxy({ views: [{ key: "unpaid", expose: ["status"] }] }, {});
    expect(() => structuredClone(proxied)).toThrow();
    const copy = cloneData(proxied);
    expect(copy.views[0]?.expose).toEqual(["status"]);
    expect(() => structuredClone(copy)).not.toThrow();
    copy.views[0]?.expose?.push("amount");
    expect(proxied.views[0]?.expose).toEqual(["status"]);
  });
});
