import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compileZeroCapsuleFromFiles } from "@spacefast/zero-compile";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, ["scripts/build-spacefast-zero.mjs", "--template"], {
  cwd: root,
  stdio: "inherit",
});
const source = join(root, ".output/spacefast-zero");
async function files(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = prefix + entry.name;
    if (entry.isDirectory()) result.push(...(await files(join(directory, entry.name), path + "/")));
    else if (entry.isFile())
      result.push({ path, bytes: await readFile(join(directory, entry.name)) });
  }
  return result;
}
const authored = await files(source);
const built = await compileZeroCapsuleFromFiles({
  files: authored,
  runtime: { kind: "zero", server: "server/index.ts", client: "client/index.tsx" },
  appName: "generated-app",
});
const payload = built.sourceMetadata.statticZero.finalize;
function parameterizeSchema(code, checkMarkers = true) {
  const ast = ts.createSourceFile(
    "runtime.js",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const ranges = [];
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(ast) === "schema" &&
      ts.isObjectLiteralExpression(node.initializer) &&
      node.initializer.properties.some((property) => property.name?.getText(ast) === "auth_links")
    )
      ranges.push([node.initializer.getStart(ast), node.initializer.end]);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (
    ranges.length !== 1 ||
    (checkMarkers &&
      (code.split("__SF_DEPLOYMENT_JSON__").length !== 2 ||
        code.split("__SF_RELEASE_ID__").length !== 2))
  )
    throw new Error("Zero compiler template shape changed; review target integration.");
  const [start, end] = ranges[0];
  return code.slice(0, start) + "__SF_SCHEMA_SOURCE__" + code.slice(end);
}
for (const bundle of payload.bundles)
  bundle.contentBase64 = Buffer.from(
    parameterizeSchema(Buffer.from(bundle.contentBase64, "base64").toString("utf8")),
  ).toString("base64");
for (const endpoint of payload.endpointSources)
  endpoint.source = parameterizeSchema(endpoint.source);
payload.artifact.sourceManifest.sourceRoot = ".";
const sources = payload.artifact.sourceManifest.files.map((file) => {
  const content = authored.find((item) => item.path === file.path).bytes.toString("utf8");
  return {
    path: file.path,
    source: file.path === "server/index.ts" ? parameterizeSchema(content, false) : content,
  };
});
const template = {
  sources,
  format: 1,
  sdkVersion: "0.8.0",
  payload,
  files: built.publishFiles
    .filter((file) => file.path !== "__spacefast/zero/deploy.json")
    .map((file) => ({
      path: file.path,
      contentType: file.contentType ?? "application/octet-stream",
      base64: file.bytes.toString("base64"),
    })),
};
const output = join(root, "static/deployment-assets/spacefast");
await mkdir(output, { recursive: true });
const json = JSON.stringify(template);
await writeFile(join(output, "template.json"), json);
await writeFile(join(output, "template.json.gz"), gzipSync(json, { level: 9 }));
console.log("Prepared browser-only Spacefast deployment template.");
