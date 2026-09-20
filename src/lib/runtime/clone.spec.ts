import { describe, expect, it } from "vite-plus/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloneData } from "@jthum/framework/svelte/authoring/data";

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

  it("keeps native structuredClone out of reactive components", async () => {
    const components = fileURLToPath(new URL("../components/", import.meta.url));
    const files = (await readdir(components, { recursive: true })).filter((file) =>
      file.endsWith(".svelte"),
    );
    const offenders: string[] = [];

    for (const file of files) {
      const source = await readFile(join(components, file), "utf8");
      if (source.includes("structuredClone(")) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
