import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
describe("Framework dependencies", () => {
  it("shares one installed Framework identity with optional packages", () => {
    const require = createRequire(resolve(root, "package.json"));
    const framework = realpathSync(require.resolve("@jthum/framework/errors"));
    for (const name of [
      "@jthum/framework-http",
      "@jthum/framework-sqlite-browser",
      "@jthum/yair",
      "@jthum/yair-openai",
    ]) {
      const fromPackage = createRequire(require.resolve(name));
      expect(realpathSync(fromPackage.resolve("@jthum/framework/errors"))).toBe(framework);
    }
    const fromProvider = createRequire(require.resolve("@jthum/yair-openai"));
    expect(realpathSync(fromProvider.resolve("@jthum/yair"))).toBe(
      realpathSync(require.resolve("@jthum/yair")),
    );
  });
});
