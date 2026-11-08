import assert from "node:assert/strict";
const {
  SPACEFAST_PROBE_URL: origin,
  SPACEFAST_PROBE_TOKEN: token,
  SPACEFAST_PROBE_COOKIE: cookie,
} = process.env;
assert.ok(origin && token);
const ids = [];
const run = crypto.randomUUID().replaceAll("-", "");
async function call(method, args = [], write = false, authorized = true) {
  const response = await fetch(new URL(`/api/app/${write ? "write" : "read"}`, origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      referer: `${origin}/`,
      "sec-fetch-site": "same-origin",
      ...(authorized ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ method, args }),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  return { status: response.status, ...body };
}
const success = async (...args) => {
  const response = await call(...args);
  assert.equal(response.status, 200, JSON.stringify(response));
  return response.result;
};
try {
  assert.equal((await call("getWorkspace", [], false, false)).status, 401);
  const workspace = await success("getWorkspace", [], true);
  assert.equal(workspace.spec.key, "task_board");
  const record = await success(
    "createRecord",
    ["task", { name: `Kernel ${run}`, priority: 5, open: true }],
    true,
  );
  ids.push(record.id);
  assert.equal(
    (await call("createRecord", ["task", { name: "Invalid", priority: "wrong" }], true)).error.code,
    "VALIDATION.INVALID_INPUT",
  );
  assert.equal((await success("getRecord", ["task", record.id])).values.name, `Kernel ${run}`);
  const submitted = await success(
    "submitForm",
    ["new_task", { values: { name: `Form ${run}`, priority: 4, open: false } }],
    true,
  );
  ids.push(submitted.record.id);
  assert.equal(submitted.mode, "create");
  const ranked = await success("queryView", ["ranked_tasks"]);
  assert.ok(ranked.data.rows.some((row) => row.id === record.id));
  const grouped = await success("querySource", [
    "task",
    {
      aggregate: {
        group: { path: ["task_open"], as: "open" },
        measures: [{ operation: "count", as: "count" }],
      },
    },
  ]);
  assert.ok(grouped.rows.some((row) => row.values.open === true && row.values.count >= 1));
  const execution = await success("startRule", ["echo"], true);
  assert.equal(execution.status, "completed");
  assert.equal(execution.result, "Ready");
  assert.equal((await success("getRuleExecutionDetails", [execution.id])).status, "completed");
  assert.ok((await success("listRuleExecutions")).some((entry) => entry.id === execution.id));
  const waiting = await success("startRule", ["review"], true);
  assert.equal(waiting.status, "waiting");
  const request = (await success("listPendingActorRequests")).find(
    (item) => item.executionId === waiting.id,
  );
  assert.ok(request);
  await success("respondToActorRequest", [waiting.id, request.id, { answer: "Approved" }], true);
  assert.equal((await success("getRuleExecutionDetails", [waiting.id])).status, "completed");
  assert.ok(
    !(await success("listPendingActorRequests")).some((item) => item.executionId === waiting.id),
  );
  const key = `probe.${run}`;
  await success("putSetting", [{ key, label: "Probe", value: "Stored" }], true);
  assert.equal((await success("getSetting", [key])).value, "Stored");
  await success("deleteSetting", [key], true);
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        "unauthorized-denial",
        "real-kernel-bootstrap",
        "record-validation-and-persistence",
        "form-submission",
        "indexed-view",
        "canonical-grouped-query",
        "durable-rule-and-history",
        "persisted-setting",
        "durable-actor-request-across-invocations",
      ],
    }),
  );
} finally {
  for (const id of ids) {
    const response = await call("deleteRecord", ["task", id], true);
    assert.equal(response.status, 200, JSON.stringify(response));
  }
}
