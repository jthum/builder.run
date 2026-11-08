import { build } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { compileDeployment } from "../examples/spacefast-zero/deployment/compile.ts";
import { fixture } from "../examples/spacefast-zero/deployment/fixture.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "examples/spacefast-zero");
const output = join(root, ".output/spacefast-zero");
const frameworkRoot = realpathSync(join(root, "node_modules/@jthum/framework"));
const compatibility = join(source, "deployment/compatibility.ts");
const cloneRoot = realpathSync(join(root, "node_modules/@ungap/structured-clone"));
const runtimeCompatibility = {
  name: "zero-kernel-runtime-services",
  transform(code, id) {
    if (id.startsWith(cloneRoot) && /\bglobalThis\b/.test(code))
      return {
        code: `import { cloneEnvironment as globalThis, cloneEnvironment as self } from ${JSON.stringify(join(source, "deployment/intrinsics.ts"))};\n${code}`,
        map: null,
      };
    if (!id.startsWith(frameworkRoot)) return;
    const names = [];
    if (/\bstructuredClone\s*\(/.test(code)) names.push("cloneData as structuredClone");
    if (/\bnew TextEncoder\b/.test(code)) names.push("Utf8Encoder as TextEncoder");
    if (names.length)
      return {
        code: `import { ${names.join(", ")} } from ${JSON.stringify(compatibility)};\n${code}`,
        map: null,
      };
  },
};
const options = process.argv.slice(2);
const specFile = options.indexOf("--spec");
const revision = options.includes("--revision=2") ? 2 : 1;
const spec =
  specFile >= 0 ? JSON.parse(await readFile(options[specFile + 1], "utf8")) : fixture(revision);
const { deployment, schema } = compileDeployment(spec, "deployed-app");
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
const entry = await readFile(join(source, "server/index.ts"), "utf8");
await writeFile(
  join(output, "server/index.ts"),
  `import { boolean, number, string, table } from "@spacefast/zero/server";\n` +
    entry.replace("// Deployment tables.", schema ? `${schema},` : ""),
);
await writeFile(
  join(output, "deployment-entry.ts"),
  `export { ZeroWorkspaceConfigStore, ZeroScopeStore } from ${JSON.stringify(join(source, "deployment/configuration.ts"))};\n` +
    `export { ZeroCatalogRepository } from ${JSON.stringify(join(source, "deployment/catalog.ts"))};\n` +
    `export { openKernelRuntime } from ${JSON.stringify(join(source, "deployment/kernel-runtime.ts"))};\n` +
    `export { handleKernelCall } from ${JSON.stringify(join(source, "deployment/rpc.ts"))};\n`,
);
await writeFile(
  join(output, "server/model.ts"),
  `export const deployment = ${JSON.stringify(deployment)};\nexport const releaseId = ${JSON.stringify(randomUUID().replaceAll("-", ""))};\nexport const testDeployment = ${options.includes("--test")};\n`,
);
await cp(join(source, "sf.jsonc"), join(output, "sf.jsonc"));

await build({
  configFile: false,
  root,
  plugins: [runtimeCompatibility],
  build: {
    outDir: join(output, "server"),
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: join(output, "deployment-entry.ts"),
      formats: ["es"],
      fileName: () => "runtime.ts",
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
await rm(join(output, "deployment-entry.ts"));
await build({
  configFile: false,
  root: join(source, "frontend"),
  base: "/",
  resolve: {
    dedupe: ["svelte", "@lucide/svelte"],
    alias: [
      { find: "$lib/app/workflow-launch.ts", replacement: join(source, "frontend/workflow.ts") },
      {
        find: "$lib/app/canonical-studio.svelte.ts",
        replacement: join(source, "frontend/data.svelte.ts"),
      },
      { find: "$lib/app/session.svelte.ts", replacement: join(source, "frontend/data.svelte.ts") },
      { find: "$lib", replacement: join(root, "src/lib") },
    ],
  },
  plugins: [tailwindcss(), svelte({ configFile: false })],
  build: {
    outDir: output,
    emptyOutDir: false,
    manifest: true,
    rolldownOptions: { input: join(source, "frontend/index.html") },
  },
});
console.log(`Prepared Spacefast app: ${output}`);
