import assert from "node:assert/strict";
import { database } from "../examples/spacefast-zero/testing/database.ts";
import { compileDeployment } from "../examples/spacefast-zero/deployment/compile.ts";
import { fixture } from "../examples/spacefast-zero/deployment/fixture.ts";
import { openKernelRuntime } from "../.output/spacefast-zero/server/runtime.ts";

// Execute the actual prepared target module with the globals absent on the hosted runtime.
const names = ["structuredClone", "crypto", "TextEncoder", "AbortController"];
const descriptors = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
const db = database();
try {
  for (const name of names)
    Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
  const { deployment } = compileDeployment(fixture(2), "runtime-smoke");
  const identity = { subject: "smoke-owner", email: "owner@example.test", name: "Owner" };
  const options = { writable: true, releaseId: "smoke-release", ownerEmail: identity.email };
  const first = await openKernelRuntime(db.install(deployment), deployment, identity, options);
  const record = await first.client.createRecord("task", {
    name: "From real Kernel",
    priority: 3,
    open: true,
  });
  assert.equal(record.createdBy, first.context.actorId);
  assert.equal((await first.client.queryView("ranked_tasks")).data.rows[0].id, record.id);
  await assert.rejects(first.client.createRecord("task", { name: "Invalid", priority: "wrong" }), {
    code: "VALIDATION.INVALID_INPUT",
  });
  first.transaction.assertHealthy();
  await first.close();
  const second = await openKernelRuntime(db.install(deployment), deployment, identity, {
    ...options,
    writable: false,
  });
  assert.equal((await second.client.getRecord("task", record.id)).values.name, "From real Kernel");
  await second.close();
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        "prepared-kernel-without-browser-globals",
        "primitive-validation",
        "indexed-view-query",
        "persistent-actor-and-record-reopen",
      ],
    }),
  );
} finally {
  db.sql.close();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
