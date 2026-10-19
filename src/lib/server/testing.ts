import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpWorkspaceClient, readJsonResponse } from "@jthum/framework-http";
import { ServerRuntime } from "./runtime.ts";
import { createServerHandler } from "./http.ts";
import type { RemoteSnapshot } from "$lib/app/remote-contract.ts";

const directories: string[] = [];
const runtimes: ServerRuntime[] = [];
export async function cleanupServerFixtures() {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
}
export async function directory() {
  const path = await mkdtemp(join(tmpdir(), "app-server-"));
  directories.push(path);
  return path;
}

export function testBrowser(handle: (request: Request) => Promise<Response>) {
  let token = "";
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    request.headers.set("origin", new URL(request.url).origin);
    if (token) request.headers.set("cookie", token);
    const response = await handle(request);
    if (response.headers.has("set-cookie"))
      token = response.headers.get("set-cookie")!.split(";", 1)[0]!;
    return response;
  };
  const command = async (
    command: string,
    input: Record<string, unknown> = {},
    selection?: RemoteSnapshot["selection"],
  ): Promise<unknown> => {
    const response = await fetch("https://example.test/api/app", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, input, ...(selection ? { selection } : {}) }),
    });
    return ((await readJsonResponse(response)) as { result: unknown }).result;
  };
  const login = async (
    username = "admin",
    password = "correct-password-for-test",
    realmId?: string,
  ) => {
    const response = await fetch("https://example.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, ...(realmId ? { realmId } : {}) }),
    });
    await readJsonResponse(response);
    return response;
  };
  const client = (snapshot: RemoteSnapshot, workspaceId = snapshot.app.id) =>
    createHttpWorkspaceClient({
      url: `https://example.test/api/workspaces/${workspaceId}?${new URLSearchParams({ spaceId: snapshot.space.id, appId: snapshot.app.id })}`,
      fetch,
    });
  return { fetch, command, login, client, getToken: () => token };
}

export async function fixture(
  path?: string,
  inference?: Parameters<typeof ServerRuntime.open>[0]["inference"],
) {
  const runtime = await ServerRuntime.open({
    directory: path ?? (await directory()),
    adminPassword: "correct-password-for-test",
    ...(inference ? { inference } : {}),
  });
  runtimes.push(runtime);
  const handle = createServerHandler(runtime);
  const browser = testBrowser(handle);
  await browser.login();
  const snapshot = (await browser.command("snapshot")) as RemoteSnapshot;
  return { runtime, handle, snapshot, ...browser };
}
