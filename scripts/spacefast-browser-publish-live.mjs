import { createServer } from "vite-plus";
import { prepareBrowserDeployment } from "../examples/spacefast-zero/deployment/browser.ts";
import { fixture } from "../examples/spacefast-zero/deployment/fixture.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

// Verifies the browser implementation's exact protocol using the CLI's existing authentication.
// This is not a browser/CORS test and does not extract credentials from CLI state.
const spaceId = process.env.SPACEFAST_TEST_SPACE,
  teamId = process.env.SPACEFAST_TEST_TEAM;
assert.ok(spaceId && teamId, "Use an explicitly selected dedicated test Space and team.");
const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(join(tmpdir(), "spacefast-browser-publish-"));
const server = await createServer({
  configFile: false,
  root,
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});
const { SpacefastApi } = await server.ssrLoadModule("/src/lib/deployments/spacefast/api.ts");
const run = promisify(execFile);
let counter = 0;
try {
  const send = async (url, init) => {
    if (new Headers(init?.headers).get("authorization") !== "Bearer test-transport")
      return fetch(url, init);
    const target = new URL(String(url));
    const args = [
      "--yes",
      "spacefast@0.8.0",
      "api",
      init?.method ?? "GET",
      target.pathname + target.search,
      "--json",
    ];
    if (init?.body) {
      const file = join(directory, `request-${++counter}.json`);
      await writeFile(file, init.body, { mode: 0o600 });
      args.push("--input", "@" + file);
    }
    const { stdout } = await run("npx", args, {
      cwd: tmpdir(),
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180000,
    });
    return new Response(stdout, { headers: { "content-type": "application/json" } });
  };
  const api = new SpacefastApi("test-transport", send);
  const destination = await api.space(spaceId);
  assert.equal(destination.teamId, teamId);
  const previous = await api.schema(spaceId);
  const template = JSON.parse(
    await readFile(join(root, "static/deployment-assets/spacefast/template.json"), "utf8"),
  );
  const prepared = prepareBrowserDeployment(template, fixture(2), previous);
  await api.setOwner(spaceId, "owner@example.test");
  const result = await api
    .startPublish(
      { spaceId, teamId, files: prepared.files, sourceMetadata: prepared.sourceMetadata },
      (message) => console.log(message),
    )
    .run(AbortSignal.timeout(240000));
  console.log(
    JSON.stringify({
      passed: true,
      spaceId: result.spaceId,
      versionId: result.versionId,
      checks: [
        "browser-generated-capsule-native-install",
        "direct-publish-manifest-and-signed-upload-protocol",
        "activation-confirmed",
      ],
      transport: "CLI-authenticated API bridge; browser CORS checked separately",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({ passed: false, code: error.code ?? error.name, requestId: error.requestId }),
  );
  process.exitCode = 1;
} finally {
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
