import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ServerRuntime } from "./runtime.ts";
import { createServerHandler } from "./http.ts";
import { directory, cleanupServerFixtures, testBrowser } from "./testing.ts";
import { setupServer } from "./setup.ts";
import { Kernel } from "@jthum/framework/kernel";
import { openServerStorage } from "./storage.ts";

const owner = { name: "Ada", username: "ada", password: "a-strong-password-for-test" };
const runtimes: ServerRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await cleanupServerFixtures();
});

async function fresh() {
  const path = await directory();
  const runtime = await ServerRuntime.open({ directory: path });
  runtimes.push(runtime);
  const handle = createServerHandler(runtime);
  const browser = testBrowser(handle);
  const post = (route: string, input: unknown = {}) =>
    browser.fetch(`https://example.test${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  return { path, runtime, handle, browser, post };
}

describe("browser first-run setup", () => {
  it("blocks normal APIs until setup, creates an owner and signs them in without restarting", async () => {
    const { path, runtime, browser, post } = await fresh();
    expect(await (await post("/api/setup/status")).json()).toEqual({ result: { required: true } });
    for (const route of ["/api/login", "/api/app", "/api/workspaces/anything"]) {
      const response = await post(route, { username: owner.username, password: owner.password });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "AUTH.SETUP_REQUIRED" } });
    }
    const response = await post("/api/setup", owner);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict;.*Secure/);
    expect(await response.json()).toEqual({ result: null });
    expect(runtime.setupRequired).toBe(false);
    const identity = await runtime.auth.authenticate(browser.getToken().split("=")[1]);
    const snapshot = await runtime.snapshot(identity);
    expect(snapshot.actor.name).toBe("Ada");
    expect(snapshot.permissions.space).toContain("manage");
    expect(snapshot.permissions.app).toContain("manage");
    expect((await readFile(join(path, "login.realm"), "utf8")).trim()).toBe(snapshot.realmId);
    expect(await (await post("/api/setup/status")).json()).toEqual({ result: { required: false } });
    await expect(browser.command("snapshot")).resolves.toMatchObject({ actor: { name: "Ada" } });
  });

  it("validates before writes, keeps the lease, and allows a corrected submission", async () => {
    const { path, runtime, post } = await fresh();
    for (const body of [{ ...owner, password: "short" }, { ...owner, actorId: "spoofed" }, null])
      expect((await post("/api/setup", body)).status).toBe(400);
    await expect(setupServer(path, owner)).rejects.toThrow("already in use");
    const tooLarge = await post("/api/setup", { ...owner, name: "x".repeat(9000) });
    expect(tooLarge.status).toBe(400);
    expect(runtime.setupRequired).toBe(true);
    expect((await post("/api/setup", owner)).status).toBe(200);
  });

  it("rejects cross-origin or missing-origin claims and honors the configured public origin", async () => {
    const { runtime } = await fresh();
    const handle = createServerHandler(runtime, { origin: "https://public.test" });
    for (const origin of [undefined, "https://attacker.test", "http://internal:3000"]) {
      const response = await handle(
        new Request("http://internal:3000/api/setup", {
          method: "POST",
          headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
          body: JSON.stringify(owner),
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(
      (await handle(new Request("http://internal:3000/api/setup", { method: "GET" }))).status,
    ).toBe(405);
    const response = await handle(
      new Request("http://internal:3000/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://public.test" },
        body: JSON.stringify(owner),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("allows exactly one concurrent claim and never changes the winner's credentials", async () => {
    const { runtime, post } = await fresh();
    const results = await Promise.all([
      post("/api/setup", owner),
      post("/api/setup", { ...owner, username: "other" }),
    ]);
    expect(results.map((response) => response.status).sort((left, right) => left - right)).toEqual([
      200, 409,
    ]);
    const winner = results[0]!.status === 200 ? "ada" : "other";
    const identity = await runtime.auth.authenticate(
      await runtime.auth.login(winner, owner.password),
    );
    const context = await runtime.context(identity);
    expect(
      (await context.spaceClient.listActorsByOrigin()).filter((actor) => actor.kind === "user"),
    ).toHaveLength(1);
    expect((await post("/api/setup", { ...owner, password: "replacement-password" })).status).toBe(
      409,
    );
    expect(await runtime.auth.login(winner, owner.password)).toBeTruthy();
  });

  it("persists the completed claim across restart and never reopens registration", async () => {
    const { path, runtime, post } = await fresh();
    expect((await post("/api/setup", owner)).status).toBe(200);
    await runtime.close();
    const reopened = await ServerRuntime.open({ directory: path });
    runtimes.push(reopened);
    expect(reopened.setupRequired).toBe(false);
    const browser = testBrowser(createServerHandler(reopened));
    expect((await browser.fetch("https://example.test/api/setup", { method: "POST" })).status).toBe(
      409,
    );
    await browser.login(owner.username, owner.password);
    await expect(browser.command("snapshot")).resolves.toMatchObject({ actor: { name: "Ada" } });
  });

  it("refuses partial data instead of exposing onboarding over an existing instance", async () => {
    const path = await directory();
    const storage = await openServerStorage(path);
    const kernel = await Kernel.open({ persistence: storage.persistence });
    try {
      await kernel.createRootWorkspace({ name: "Keep", user: { name: "Existing" } });
    } finally {
      await kernel.close();
      await storage.release();
    }
    await expect(ServerRuntime.open({ directory: path })).rejects.toThrow("will not overwrite");
  });
});
