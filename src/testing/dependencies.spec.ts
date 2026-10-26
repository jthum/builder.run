import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const configuration = parse(readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"));
const packages = {
  "@jthum/framework": "",
  "@jthum/framework-http": "packages/http",
  "@jthum/framework-sqlite-browser": "packages/sqlite/browser",
  "@jthum/yair": "packages/inference/yair/core",
  "@jthum/yair-openai": "packages/inference/yair/providers/openai",
};

describe("Framework dependencies", () => {
  it("pins every package to the same immutable Git revision without a local checkout", () => {
    const revision = manifest.dependencies["@jthum/framework"].split("#")[1];
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
    for (const [name, directory] of Object.entries(packages)) {
      expect(manifest.dependencies[name]).toBe(
        `github:jthum/framework#${revision}${directory ? `&path:${directory}` : ""}`,
      );
      expect(configuration.allowBuilds[`${name}@git+https://github.com/jthum/framework.git`]).toBe(
        true,
      );
    }
    expect(
      Object.values(manifest.dependencies).some((source) => String(source).startsWith("link:")),
    ).toBe(false);
    expect(configuration.blockExoticSubdeps).not.toBe(false);
    expect(configuration.dangerouslyAllowAllBuilds).not.toBe(true);
  });

  it("shares one installed Framework identity with optional packages", () => {
    const require = createRequire(resolve(root, "package.json"));
    const framework = realpathSync(require.resolve("@jthum/framework/errors"));
    for (const name of Object.keys(packages).filter((name) => name !== "@jthum/framework")) {
      const fromPackage = createRequire(require.resolve(name));
      expect(realpathSync(fromPackage.resolve("@jthum/framework/errors"))).toBe(framework);
    }
    const fromProvider = createRequire(require.resolve("@jthum/yair-openai"));
    expect(realpathSync(fromProvider.resolve("@jthum/yair"))).toBe(
      realpathSync(require.resolve("@jthum/yair")),
    );
  });
});
