import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

/** A real production process and independent cookie jars; no Kernel or authentication mocks. */
export function createServerTest() {
  let child;
  let origin;
  async function start(directory) {
    assert(!child, "Stop the previous test server before starting another.");
    const probe = createServer();
    const listening = once(probe, "listening");
    probe.listen(0, "127.0.0.1");
    await listening;
    const port = probe.address().port;
    await new Promise((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
    origin = `http://127.0.0.1:${port}`;
    let logs = "";
    let failure;
    child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../build/index.js", import.meta.url))],
      {
        env: {
          ...process.env,
          DATA_DIR: directory,
          ORIGIN: origin,
          HOST: "127.0.0.1",
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.on("error", (error) => {
      failure = error;
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => {
        logs = `${logs}${data}`.slice(-12000);
      });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Built server exited unexpectedly: ${logs}`);
      try {
        const response = await fetch(`${origin}/api/app`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ command: "snapshot" }),
          signal: AbortSignal.timeout(2000),
        });
        if (response.status === 401) {
          await response.body?.cancel();
          return;
        }
        if (response.status !== 503)
          throw new Error(
            `Unexpected startup response ${response.status}: ${await response.text()}\n${logs}`,
          );
        await response.body?.cancel();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          (!(error instanceof TypeError) && error.name !== "TimeoutError")
        )
          throw error;
      }
      await delay(100);
    }
    throw new Error(`Built server did not become ready: ${logs}`);
  }

  async function stop(signal = "SIGTERM") {
    const current = child;
    if (!current) return;
    try {
      if (current.exitCode !== null || current.signalCode !== null || !current.pid) return;
      const exited = once(current, "exit");
      let forced = false;
      const timer = setTimeout(() => {
        forced = true;
        current.kill("SIGKILL");
      }, 15000);
      try {
        current.kill(signal);
        await exited;
        assert(!forced, "Server did not stop within 15 seconds.");
      } finally {
        clearTimeout(timer);
      }
    } finally {
      child = undefined;
    }
  }

  function session() {
    let cookie = "";
    const post = async (path, body) => {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";", 1)[0];
      return response;
    };
    const request = async (path, body, expectedStatus = 200) => {
      const response = await post(path, body);
      const envelope = await response.json();
      assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(envelope)}`);
      return response.status === 200 ? envelope.result : envelope.error;
    };
    return { post, request };
  }
  return {
    start,
    stop,
    session,
    get origin() {
      return origin;
    },
  };
}
