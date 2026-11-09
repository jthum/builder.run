import { describe, expect, it } from "vite-plus/test";
import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createSpacefastRelay } from "../../../../relay/spacefast.mjs";
import { createRelayServer } from "../../../../relay/server.mjs";
import { spacefastRelayFetch } from "./transport.ts";

const origin = "https://builder.run";
import type { AddressInfo } from "node:net";

function request(
  path = "/v1/publish",
  method = "POST",
  body = "payload",
  extra: Record<string, string> = {},
) {
  return new Request("https://builder.run/relay/spacefast", {
    method: "POST",
    headers: {
      origin,
      authorization: "Bearer user-key",
      "x-relay-path": path,
      "x-relay-method": method,
      ...extra,
    },
    body,
  });
}

describe("standalone Spacefast relay", () => {
  it("streams the unchanged request/response while excluding browser credentials and transport headers", async () => {
    const relay = createSpacefastRelay({
      origins: [origin],
      fetch: async (url, init) => {
        expect((url as URL).href).toBe("https://api.spacefast.com/v1/publish?test=1");
        expect(init!.method).toBe("POST");
        expect(init!.redirect).toBe("manual");
        expect(new Headers(init!.headers).get("authorization")).toBe("Bearer user-key");
        expect(new Headers(init!.headers).get("idempotency-key")).toBe("same-intent");
        expect(new Headers(init!.headers).has("cookie")).toBe(false);
        expect(new Headers(init!.headers).has("origin")).toBe(false);
        expect(new Headers(init!.headers).has("x-relay-path")).toBe(false);
        expect(await new Response(init?.body).text()).toBe("payload");
        return new Response("upstream error", {
          status: 409,
          headers: {
            "content-type": "application/json",
            "x-request-id": "trace",
            "set-cookie": "private=1",
            "access-control-allow-origin": "wrong",
            "content-encoding": "gzip",
          },
        });
      },
    });
    const result = await relay(
      request("/v1/publish?test=1", "POST", "payload", {
        cookie: "browser=secret",
        "idempotency-key": "same-intent",
      }),
    );
    expect(result.status).toBe(409);
    expect(result.headers.get("access-control-allow-origin")).toBe(origin);
    expect(result.headers.get("x-request-id")).toBe("trace");
    expect(result.headers.has("set-cookie")).toBe(false);
    expect(result.headers.has("content-encoding")).toBe(false);
    expect(await result.text()).toBe("upstream error");
  });

  it("refuses arbitrary destinations, unrelated operations, foreign origins and missing keys", async () => {
    let calls = 0;
    const relay = createSpacefastRelay({
      origins: [origin],
      fetch: async () => {
        calls++;
        return new Response();
      },
    });
    for (const input of [
      request("https://internal.test/"),
      request("//internal.test/"),
      request("/v1/spaces/space", "DELETE"),
      request("/v1/feedback"),
      request("/v1/publish", "POST", "", { origin: "https://builder.run.attacker.test" }),
      request("/v1/publish", "POST", "", { authorization: "" }),
    ]) {
      expect((await relay(input)).status).toBeGreaterThanOrEqual(400);
    }
    expect(calls).toBe(0);
    const preflight = await relay(
      new Request("https://builder.run/relay/spacefast", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers":
            "authorization,content-type,x-relay-path,x-relay-method,idempotency-key",
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("enforces declared and streamed limits and never follows upstream redirects", async () => {
    let calls = 0;
    const relay = createSpacefastRelay({
      origins: [origin],
      maxBytes: 4,
      fetch: async (_url, init) => {
        calls++;
        await new Response(init?.body).text();
        return new Response();
      },
    });
    expect(
      (await relay(request("/v1/publish", "POST", "12345", { "content-length": "5" }))).status,
    ).toBe(413);
    expect(calls).toBe(0);
    expect((await relay(request("/v1/publish", "POST", "12345"))).status).toBe(413);
    const redirects = createSpacefastRelay({
      origins: [origin],
      fetch: async () =>
        new Response(null, { status: 307, headers: { location: "https://other.test/" } }),
    });
    const result = await redirects(request());
    expect(result.status).toBe(502);
    expect(result.headers.has("location")).toBe(false);
  });

  it("holds concurrency slots until streamed responses finish and propagates cancellation", async () => {
    let signal: AbortSignal | undefined;
    const relay = createSpacefastRelay({
      origins: [origin],
      maxConcurrent: 1,
      fetch: async (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Response("stream");
      },
    });
    const controller = new AbortController();
    const first = await relay(new Request(request(), { signal: controller.signal }));
    expect((await relay(request())).status).toBe(503);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    await first.body!.cancel();
    const next = await relay(request());
    expect(next.status).toBe(200);
    await next.text();
  });

  it("runs the browser transport through the actual Node HTTP wrapper", async () => {
    const seen: Array<[string, string, string | null, number[] | null]> = [];
    const server = createRelayServer(
      createSpacefastRelay({
        origins: [origin],
        fetch: async (url, init) => {
          if (init?.method === "PUT")
            expect(new Headers(init.headers).get("x-spacefast-path")).toBe("assets/font.woff2");
          seen.push([
            (url as URL).pathname,
            init!.method!,
            new Headers(init!.headers).get("authorization"),
            init?.body
              ? Array.from(new Uint8Array(await new Response(init?.body).arrayBuffer()))
              : null,
          ]);
          return Response.json({ data: { accepted: true } });
        },
      }),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const transport = spacefastRelayFetch(endpoint, (url, init) =>
      fetch(url, {
        ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers)), origin },
      }),
    );
    try {
      expect(
        await (
          await transport("https://api.spacefast.com/v1/bootstrap", {
            headers: { authorization: "Bearer user-key" },
          })
        ).json(),
      ).toEqual({ data: { accepted: true } });
      expect(
        await (
          await transport("https://api.spacefast.com/v1/spaces/space/uploads/upload", {
            method: "PUT",
            headers: {
              authorization: "Bearer scoped-upload",
              "content-type": "application/octet-stream",
              "x-spacefast-path": "assets/font.woff2",
            },
            body: new Blob([new Uint8Array([0, 255, 1, 128])]),
          })
        ).json(),
      ).toEqual({ data: { accepted: true } });
      expect(seen).toEqual([
        ["/v1/bootstrap", "GET", "Bearer user-key", null],
        ["/v1/spaces/space/uploads/upload", "PUT", "Bearer scoped-upload", [0, 255, 1, 128]],
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  it("starts from just the two copied scripts without a repository or installed dependencies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "builder-relay-"));
    let child: ReturnType<typeof spawn> | undefined;
    try {
      for (const file of ["server.mjs", "spacefast.mjs"])
        await cp(new URL(`../../../../relay/${file}`, import.meta.url), join(directory, file));
      child = spawn(process.execPath, ["server.mjs", "--origin", origin, "--port", "0"], {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const [output] = await once(child.stdout!, "data", { signal: AbortSignal.timeout(5000) });
      const port = /:(\d+)/.exec(String(output))![1];
      const result = await fetch(`http://127.0.0.1:${port}/`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,x-relay-path,x-relay-method",
        },
      });
      expect(result.status).toBe(204);
      expect(result.headers.get("access-control-allow-origin")).toBe(origin);
    } finally {
      if (child && child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
