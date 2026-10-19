import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

// Deterministic HTTP/process proof; no browser, provider calls, or user data are involved.
const directory = await mkdtemp(join(tmpdir(), "app-server-smoke-"));
const restored = await mkdtemp(join(tmpdir(), "app-server-restore-"));
const password = randomBytes(24).toString("base64url");
let processHandle;
let cookie = "";
let origin;

async function start(dataDir) {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  origin = `http://127.0.0.1:${port}`;
  let logs = "";
  processHandle = spawn(process.execPath, ["build/index.js"], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      ORIGIN: origin,
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processHandle.stdout.on("data", (data) => {
    logs = `${logs}${data}`.slice(-12000);
  });
  processHandle.stderr.on("data", (data) => {
    logs = `${logs}${data}`.slice(-12000);
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null)
      throw new Error(`Built server exited unexpectedly: ${logs}`);
    try {
      const response = await fetch(`${origin}/api/app`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ command: "snapshot" }),
      });
      if (response.status === 401) return;
      if (response.status !== 503)
        throw new Error(
          `Unexpected startup response ${response.status}: ${await response.text()}\n${logs}`,
        );
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Built server did not become ready: ${logs}`);
}

async function stop(signal = "SIGTERM") {
  const child = processHandle;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill(signal);
  await Promise.race([
    exited,
    new Promise((_, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Server did not stop."));
      }, 15000);
      timeout.unref();
    }),
  ]);
}

async function request(path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  if (response.headers.has("set-cookie"))
    cookie = response.headers.get("set-cookie").split(";", 1)[0];
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.result;
}

async function initialize(dataDir, expectedCode = 0) {
  const child = spawn(process.execPath, ["build/setup.mjs", "--stdin"], {
    env: { ...process.env, DATA_DIR: dataDir },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  child.stdin.on("error", () => {}); // A repeat setup may reject before reading stdin.
  child.stdin.end(JSON.stringify({ name: "Test owner", username: "admin", password }));
  const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
  try {
    const code = await exited;
    assert.equal(code, expectedCode, output);
    assert.equal(output.includes(password), false, "Setup must not echo passwords");
    if (expectedCode !== 0) assert.match(output, /already set up/);
  } finally {
    clearTimeout(timeout);
  }
}

try {
  await assert.rejects(start(directory), /not been initialized/);
  await initialize(directory);
  await start(directory);
  await request("/api/login", { username: "admin", password });
  const snapshot = await request("/api/app", { command: "snapshot" });
  const endpoint = `/api/workspaces/${snapshot.app.id}?${new URLSearchParams({ spaceId: snapshot.space.id, appId: snapshot.app.id })}`;
  const spec = {
    ...snapshot.app.spec,
    collections: [
      {
        id: "notes",
        key: "note",
        label: "Note",
        fields: [{ id: "title", key: "title", label: "Title", type: "text" }],
      },
    ],
  };
  await request(endpoint, { method: "applySpec", args: [spec] });
  const record = await request(endpoint, {
    method: "createRecord",
    args: ["note", { title: "Survives a process restart" }],
  });
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      request(endpoint, {
        method: "createRecord",
        args: ["note", { title: `Concurrent ${index}` }],
      }),
    ),
  );
  assert.equal((await request(endpoint, { method: "listRecords", args: ["note"] })).length, 9);

  await stop("SIGKILL");
  await start(directory);
  // The existing opaque session also survives a real process restart.
  assert.equal(
    (await request(endpoint, { method: "getRecord", args: ["note", record.id] })).values.title,
    "Survives a process restart",
  );
  await stop();
  await initialize(directory, 1); // Setup cannot reset the persisted owner or records.
  await cp(directory, restored, { recursive: true });
  await start(restored);
  assert.equal((await request(endpoint, { method: "listRecords", args: ["note"] })).length, 9);

  const people = await request("/api/app", {
    command: "people.create",
    selection: snapshot.selection,
    input: { name: "Colleague", username: "colleague", password: `${password}-initial` },
  });
  const colleague = people.people.find((person) => person.username === "colleague");
  assert.deepEqual(colleague.permissions, ["read"]);
  let memberCookie = "";
  const asMember = async (path, body) => {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(memberCookie ? { cookie: memberCookie } : {}),
      },
      body: JSON.stringify(body),
    });
    if (response.headers.has("set-cookie"))
      memberCookie = response.headers.get("set-cookie").split(";", 1)[0];
    return response;
  };
  assert.equal(
    (await asMember("/api/login", { username: "colleague", password: `${password}-initial` }))
      .status,
    200,
  );
  assert.equal(
    (await asMember(endpoint, { method: "getRecord", args: ["note", record.id] })).status,
    200,
  );
  assert.equal(
    (await asMember(endpoint, { method: "createRecord", args: ["note", { title: "Denied" }] }))
      .status,
    403,
  );
  assert.equal(
    (
      await asMember("/api/app", {
        command: "security.password",
        input: { currentPassword: `${password}-initial`, password: `${password}-changed` },
      })
    ).status,
    200,
  );
  await request("/api/app", {
    command: "people.revokeSessions",
    selection: snapshot.selection,
    input: { actorId: colleague.actor.id },
  });
  assert.equal(
    (await asMember(endpoint, { method: "getRecord", args: ["note", record.id] })).status,
    401,
  );
  assert.equal(
    (await asMember("/api/login", { username: "colleague", password: `${password}-changed` }))
      .status,
    200,
  );
  await request("/api/app", {
    command: "people.remove",
    selection: snapshot.selection,
    input: { actorId: colleague.actor.id },
  });
  assert.equal(
    (await asMember(endpoint, { method: "getRecord", args: ["note", record.id] })).status,
    401,
  );
  await request("/api/logout", {});
  console.log(
    "Server smoke passed: explicit setup, uninitialized-start refusal, login, concurrent writes, process restart, backup/restore, user access, password changes, session revocation and logout.",
  );
} finally {
  await stop();
  await Promise.all(
    [directory, restored].map((path) => rm(path, { recursive: true, force: true })),
  );
}
