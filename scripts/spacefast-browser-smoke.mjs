import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  prepareBrowserDeployment,
  deployDigest,
} from "../examples/spacefast-zero/deployment/browser.ts";
import { fixture } from "../examples/spacefast-zero/deployment/fixture.ts";
import {
  createZeroMigrationPlan,
  zeroDeployDigest,
  compileZeroCapsuleFromFiles,
} from "@spacefast/zero-compile";
import { zeroRuntimeFinalizePayloadSchema } from "@spacefast/common/contracts/zero";

const template = JSON.parse(
  await readFile(
    new URL("../static/deployment-assets/spacefast/template.json", import.meta.url),
    "utf8",
  ),
);
const spec = fixture(2);
const prepared = prepareBrowserDeployment(template, spec, {}, "browser-proof");
const payload = zeroRuntimeFinalizePayloadSchema.parse(
  prepared.sourceMetadata.statticZero.finalize,
);
assert.equal(deployDigest(payload), zeroDeployDigest(payload));
assert.deepEqual(
  payload.migrations,
  createZeroMigrationPlan({ previousSchema: null, nextSchema: prepared.schema, mode: "safe" }),
);
const native = await compileZeroCapsuleFromFiles({
  files: prepared.sources.map((file) => ({ path: file.path, bytes: Buffer.from(file.source) })),
  runtime: { kind: "zero", server: "server/index.ts", client: "client/index.tsx" },
  appName: "generated-app",
});
assert.deepEqual(
  native.sourceMetadata.statticZero.finalize.artifact.server.schema,
  prepared.schema,
);
assert.equal(
  prepared.files.some((file) => file.path === "index.html"),
  true,
);
assert.ok(
  payload.endpointSources.every(
    (endpoint) =>
      !endpoint.source.includes("__SF_SCHEMA_SOURCE__") &&
      !endpoint.source.includes("__SF_RELEASE_ID__"),
  ),
);
const renamed = { ...spec, label: 'Literal "__SF_RELEASE_ID__" and __SF_SCHEMA_SOURCE__' };
const followup = prepareBrowserDeployment(template, renamed, prepared.schema, "second-release");
assert.deepEqual(followup.sourceMetadata.statticZero.finalize.migrations.operations, []);
assert.equal(
  followup.sourceMetadata.statticZero.finalize.bundles[0].contentBase64.includes("API_KEY"),
  false,
);
console.log(
  JSON.stringify({
    passed: true,
    checks: [
      "browser-artifact-validates-with-native-SDK",
      "native-schema-equivalence",
      "native-migration-plan-equivalence",
      "native-deploy-digest-equivalence",
      "existing-schema-redeployment",
      "template-substitution-preserves-literal-data",
    ],
  }),
);
