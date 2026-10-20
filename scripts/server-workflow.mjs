import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerTest } from "./server-test.mjs";

// Public HTTP only, against the built server and fresh native SQLite storage.
const directory = await mkdtemp(join(tmpdir(), "app-server-workflow-"));
const server = createServerTest();
const admin = server.session();
const requester = server.session();
const reviewer = server.session();
const password = randomBytes(24).toString("base64url");

try {
  await server.start(directory);
  await admin.request("/api/setup", { name: "Administrator", username: "admin", password });
  const snapshot = await admin.request("/api/app", { command: "snapshot" });
  const endpoint = `/api/workspaces/${snapshot.app.id}?${new URLSearchParams({ spaceId: snapshot.space.id, appId: snapshot.app.id })}`;
  const rpc = (session, method, ...args) => session.request(endpoint, { method, args });
  const denied = async (session, method, args, status, code) => {
    const error = await session.request(endpoint, { method, args }, status);
    assert.equal(error.code, code, `${method} must reject with ${code}`);
  };
  const people = (command, input) =>
    admin.request("/api/app", { command, selection: snapshot.selection, input });
  const addUser = async (username, permissions) => {
    const result = await people("people.create", {
      name: username,
      username,
      password,
      permissions: ["read"],
      apps: [{ appId: snapshot.app.id, permissions }],
    });
    const person = result.people.find((person) => person.username === username);
    assert(person, `Missing provisioned user ${username}`);
    return person.actor.id;
  };
  const requesterId = await addUser("requester", ["read", "create", "update"]);
  const reviewerId = await addUser("reviewer", ["read"]);
  for (const [session, username] of [
    [requester, "requester"],
    [reviewer, "reviewer"],
  ])
    await session.request("/api/login", { username, password, realmId: snapshot.realmId });

  const receipt = (id, phase) => ({
    id,
    action: {
      key: "records.create",
      input: {
        sourceId: "receipts",
        values: { receipt_request_id: { $ref: "vars.request.id" }, receipt_phase: phase },
      },
    },
  });
  const spec = {
    ...snapshot.app.spec,
    collections: [
      {
        id: "requests",
        key: "request",
        label: "Request",
        fields: [
          { id: "request_title", key: "title", label: "Title", type: "text", required: true },
          {
            id: "request_status",
            key: "status",
            label: "Status",
            type: "text",
            default: "pending",
          },
        ],
      },
      {
        id: "receipts",
        key: "receipt",
        label: "Receipt",
        fields: [
          {
            id: "receipt_request_id",
            key: "request_id",
            label: "Request ID",
            type: "text",
            required: true,
          },
          { id: "receipt_phase", key: "phase", label: "Phase", type: "text", required: true },
        ],
      },
    ],
    forms: [
      {
        id: "request_form",
        key: "request_approval",
        label: "Request approval",
        mode: "create",
        collectionId: "requests",
        fieldIds: ["request_title"],
      },
    ],
    rules: [
      {
        id: "approval_rule",
        key: "approve_request",
        label: "Approve request",
        input: { request: { sourceId: "requests", required: true } },
        trigger: { event: "form.submitted", sourceId: "requests", formId: "request_form" },
        steps: [
          receipt("received", "submitted"),
          {
            id: "review",
            wait: {
              request: {
                actor: "reviewer",
                label: "Approve this request?",
                description: { $ref: "vars.request", fieldId: "request_title" },
                fields: [
                  {
                    id: "approval",
                    key: "approved",
                    label: "Approve?",
                    type: "boolean",
                    required: true,
                  },
                ],
              },
              as: "decision",
            },
          },
          {
            id: "decide",
            gate: {
              predicate: { op: "context.equals", path: "vars.decision.approved", value: true },
              pass: [{ id: "approve", compute: { assign: { outcome: "approved" } } }],
              fail: [{ id: "decline", compute: { assign: { outcome: "declined" } } }],
            },
          },
          {
            id: "update",
            action: {
              key: "records.update",
              input: {
                record: { $ref: "vars.request" },
                values: { request_status: { $ref: "vars.outcome" } },
              },
            },
          },
          receipt("finished", "completed"),
        ],
        result: { $ref: "vars.outcome" },
      },
    ],
  };
  await rpc(admin, "applySpec", spec);
  await rpc(admin, "putActorBinding", { key: "reviewer", actorId: reviewerId });

  const receiptsFor = async (recordId) => {
    const result = await rpc(admin, "querySource", "receipt", {
      filter: { path: ["receipt_request_id"], operator: "eq", value: recordId },
      limit: 10,
    });
    assert.equal(result.rows.length, result.total, "Receipt assertions must inspect every match");
    return Promise.all(result.rows.map((row) => rpc(admin, "getRecord", "receipt", row.id)));
  };
  const getRecord = (id) => rpc(admin, "getRecord", "request", id);
  const details = (id) => rpc(admin, "getRuleExecutionDetails", id);
  async function submit(title) {
    const submission = await rpc(requester, "submitForm", "request_approval", {
      values: { title },
    });
    assert.equal(submission.mode, "create");
    assert.equal(submission.record.createdBy, requesterId);
    assert.equal(submission.record.values.status, "pending");
    const pending = await rpc(reviewer, "listPendingActorRequests");
    assert.equal(pending.length, 1, "Form submission must create one approval task");
    const task = pending[0];
    assert.equal(task.actorId, reviewerId);
    assert.equal(task.status, "pending");
    assert.equal(task.description, title);
    const execution = await details(task.executionId);
    assert.equal(execution.actorId, requesterId);
    assert.equal(execution.status, "waiting");
    assert.deepEqual(await rpc(requester, "listPendingActorRequests"), []);
    const receipts = await receiptsFor(submission.record.id);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].values.phase, "submitted");
    assert.equal(receipts[0].createdBy, requesterId);
    return { recordId: submission.record.id, task, execution, receipts };
  }
  async function reopen(waiting) {
    // Kill only after the waiting checkpoint was acknowledged. This is not an arbitrary crash-window proof.
    await server.stop("SIGKILL");
    await server.start(directory);
    // Reuse the existing cookies, without signing anyone in again.
    assert.deepEqual(await rpc(reviewer, "listPendingActorRequests"), [waiting.task]);
    assert.deepEqual(await details(waiting.task.executionId), waiting.execution);
    assert.deepEqual(await receiptsFor(waiting.recordId), waiting.receipts);
  }

  const approved = await submit("Laptop purchase");
  await denied(
    admin,
    "respondToActorRequest",
    [approved.task.executionId, approved.task.id, { approved: true }],
    403,
    "PERMISSION.DENIED",
  );
  await denied(
    requester,
    "respondToActorRequest",
    [approved.task.executionId, approved.task.id, { approved: true }],
    403,
    "PERMISSION.DENIED",
  );
  await denied(
    reviewer,
    "getRuleExecutionDetails",
    [approved.task.executionId],
    403,
    "PERMISSION.DENIED",
  );
  await denied(
    reviewer,
    "updateRecord",
    ["request", approved.recordId, { status: "approved" }],
    403,
    "PERMISSION.DENIED",
  );
  await reopen(approved);
  const response = await rpc(
    reviewer,
    "respondToActorRequest",
    approved.task.executionId,
    approved.task.id,
    { approved: true },
  );
  assert.equal(response.status, "responded");
  assert.equal(response.actorId, reviewerId);
  const completed = await details(approved.task.executionId);
  assert.equal(completed.status, "completed");
  assert.equal(completed.actorId, requesterId);
  assert.equal(completed.result, "approved");
  const saved = await getRecord(approved.recordId);
  assert.equal(saved.values.status, "approved");
  assert.equal(
    saved.updatedBy,
    requesterId,
    "Approval must not lend the reviewer's identity to the Rule",
  );
  const receipts = await receiptsFor(approved.recordId);
  assert.equal(receipts.length, 2);
  assert(receipts.every((record) => record.createdBy === requesterId));
  assert.deepEqual(
    receipts.filter((record) => record.values.phase === "submitted"),
    approved.receipts,
  );
  assert.equal(receipts.filter((record) => record.values.phase === "completed").length, 1);
  await denied(
    reviewer,
    "respondToActorRequest",
    [approved.task.executionId, approved.task.id, { approved: true }],
    409,
    "RESOURCE.CONFLICT",
  );
  assert.deepEqual(await getRecord(approved.recordId), saved);
  assert.deepEqual(await receiptsFor(approved.recordId), receipts);
  assert.deepEqual(await rpc(reviewer, "listPendingActorRequests"), []);
  console.log(
    "Workflow passed: Form → assigned approval → process restart → completion as the requester; unauthorized and duplicate responses denied.",
  );

  const revoked = await submit("Travel booking");
  await people("people.update", {
    actorId: requesterId,
    permissions: ["read"],
    apps: [{ appId: snapshot.app.id, permissions: ["read", "create"] }],
  });
  await people("people.update", {
    actorId: reviewerId,
    permissions: ["read"],
    apps: [{ appId: snapshot.app.id, permissions: ["read", "create", "update"] }],
  });
  await reopen(revoked);
  await denied(
    requester,
    "updateRecord",
    ["request", revoked.recordId, { status: "approved" }],
    403,
    "PERMISSION.DENIED",
  );
  // Prove the responder now has update authority, but cannot donate it to the initiating Actor.
  await rpc(reviewer, "updateRecord", "request", approved.recordId, { title: "Reviewer can edit" });
  await denied(
    reviewer,
    "respondToActorRequest",
    [revoked.task.executionId, revoked.task.id, { approved: true }],
    403,
    "PERMISSION.DENIED",
  );
  const failed = await details(revoked.task.executionId);
  assert.equal(failed.status, "failed");
  assert.equal(failed.actorId, requesterId);
  assert.match(failed.failure, /PERMISSION\.DENIED/);
  assert.equal((await getRecord(revoked.recordId)).values.status, "pending");
  assert.deepEqual(await receiptsFor(revoked.recordId), revoked.receipts);
  assert.equal(
    (await rpc(reviewer, "listActorRequests", revoked.task.executionId))[0].status,
    "responded",
  );
  assert.deepEqual(await rpc(reviewer, "listPendingActorRequests"), []);
  await denied(
    reviewer,
    "respondToActorRequest",
    [revoked.task.executionId, revoked.task.id, { approved: true }],
    409,
    "RESOURCE.CONFLICT",
  );
  await server.stop("SIGKILL");
  await server.start(directory);
  assert.deepEqual(await details(revoked.task.executionId), failed);
  assert.deepEqual(await receiptsFor(revoked.recordId), revoked.receipts);
  assert.equal((await getRecord(revoked.recordId)).values.status, "pending");
  console.log(
    "Workflow passed: revoked requester permission survives restart; reviewer authority cannot rescue the forbidden write.",
  );
} finally {
  try {
    await server.stop();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
