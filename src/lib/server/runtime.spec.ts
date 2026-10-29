import { afterEach, describe, expect, it } from "vite-plus/test";
import { readdir, cp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHttpWorkspaceClient } from "@jthum/framework-http";
import { createWorkspaceClient } from "@jthum/framework/client";
import { createEmptySpec } from "@jthum/framework/spec";
import { ServerRuntime } from "./runtime.ts";
import { createServerHandler } from "./http.ts";
import { ServerAuth } from "./auth.ts";
import type { RemoteSnapshot } from "$lib/app/remote-contract.ts";

import { fixture, directory, cleanupServerFixtures } from "./testing.ts";

afterEach(cleanupServerFixtures);

describe("server deployment", () => {
  it("rejects invalid and duplicate credentials before provisioning Actors", async () => {
    const f = await fixture();
    const owner = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: f.snapshot.space.id,
      actorId: f.snapshot.actorId,
    });
    const before = await owner.listMembers();
    await expect(
      f.command(
        "people.create",
        {
          name: "Invalid",
          username: "invalid",
          password: "short",
        },
        f.snapshot.selection,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
    expect(await owner.listMembers()).toHaveLength(before.length);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        f.command(
          "people.create",
          {
            name: "Colleague",
            username: "colleague",
            password: "colleague-password-for-test",
          },
          f.snapshot.selection,
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await owner.listMembers()).toHaveLength(before.length + 1);
    await f.login("colleague", "colleague-password-for-test");
    const snapshot = (await f.command("snapshot", {}, f.snapshot.selection)) as RemoteSnapshot;
    expect(snapshot.actor.name).toBe("Colleague");
    expect(snapshot.actor.id).not.toBe(f.snapshot.actorId);
  });

  it("persists real records, templates, credentials and sessions across close/reopen and backup restore", async () => {
    const path = await directory();
    const first = await fixture(path);
    const created = (await first.command(
      "createApp",
      { name: "Projects", template: "project_tracker" },
      first.snapshot.selection,
    )) as RemoteSnapshot;
    expect(created.app.spec.collections.length).toBeGreaterThan(0);
    const client = first.client(created);
    await client.applySpec({
      ...createEmptySpec({ id: "spec", key: "notes", label: "Notes" }),
      collections: [
        {
          id: "notes",
          key: "note",
          label: "Note",
          fields: [{ id: "title", key: "title", label: "Title", type: "text" }],
        },
      ],
    });
    const record = await client.createRecord("note", { title: "Survives restart" });
    const oldToken = first.getToken();
    await first.runtime.close();
    const backup = await directory();
    await cp(path, backup, { recursive: true });
    const second = await fixture(path);
    expect(await second.client(created).getRecord("note", record.id)).toMatchObject({
      values: { title: "Survives restart" },
    });
    const oldSession = await second.handle(
      new Request("https://example.test/api/app", {
        method: "POST",
        headers: {
          origin: "https://example.test",
          cookie: oldToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ command: "snapshot", selection: created.selection }),
      }),
    );
    expect(oldSession.status).toBe(200);
    await second.runtime.close();
    const restored = await fixture(backup);
    expect(await restored.client(created).getRecord("note", record.id)).toMatchObject({
      values: { title: "Survives restart" },
    });
    const files = await readdir(backup);
    expect(files).toContain("catalog.db");
    expect(files.some((name) => name.startsWith("catalog-w-") && name.endsWith(".db"))).toBe(true);
    expect(files).toContain("secret.key");
  });

  it("uses cookie-bound Actors and never allows a reader to impersonate the owner", async () => {
    const f = await fixture();
    const owner = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: f.snapshot.space.id,
      actorId: f.snapshot.actorId,
    });
    const member = await owner.createMember({ name: "Reader", permissions: ["read"] });
    const app = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: f.snapshot.app.id,
      actorId: f.snapshot.actorId,
    });
    await app.addMembership({
      actorId: member.actor.id,
      workspaceId: f.snapshot.app.id,
      permissions: ["read"],
    });
    await f.runtime.auth.createLogin(f.snapshot.space.id, "reader", "reader-password-for-test", {
      [f.snapshot.space.id]: member.actor.id,
    });
    await f.login("reader", "reader-password-for-test");
    const snapshot = (await f.command("snapshot", {}, f.snapshot.selection)) as RemoteSnapshot;
    expect(snapshot.actor.id).toBe(member.actor.id);
    expect(snapshot.databases).toEqual([]);
    expect((await f.client(snapshot).getWorkspace()).id).toBe(snapshot.app.id);
    await expect(f.client(snapshot).applySpec(snapshot.app.spec)).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
    const forged = await f.fetch(
      `https://example.test/api/workspaces/${snapshot.app.id}?spaceId=${snapshot.space.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "getWorkspace", args: [], actorId: f.snapshot.actorId }),
      },
    );
    expect(forged.status).toBe(400);
  });

  it("keeps new Spaces independently issued and inaccessible to another login", async () => {
    const f = await fixture();
    const newSpace = (await f.command(
      "createSpace",
      { name: "Independent" },
      f.snapshot.selection,
    )) as RemoteSnapshot;
    expect(newSpace.space.id).not.toBe(f.snapshot.space.id);
    expect(newSpace.actor.originId).toBe(newSpace.space.id);
    expect(newSpace.actor.id).not.toBe(f.snapshot.actor.id);
    expect(((await f.command("snapshot", {}, newSpace.selection)) as RemoteSnapshot).space.id).toBe(
      newSpace.space.id,
    );
    const owner = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: f.snapshot.space.id,
      actorId: f.snapshot.actorId,
    });
    const member = await owner.createMember({ name: "Other", permissions: ["read"] });
    await f.runtime.auth.createLogin(f.snapshot.space.id, "other", "other-password-for-test", {
      [f.snapshot.space.id]: member.actor.id,
    });
    await f.login("other", "other-password-for-test");
    await expect(f.command("snapshot", {}, newSpace.selection)).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
  });

  it("rejects cross-origin mutations and expired/revoked sessions", async () => {
    const f = await fixture();
    const response = await f.handle(
      new Request("https://example.test/api/app", {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          cookie: f.getToken(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ command: "snapshot" }),
      }),
    );
    expect(response.status).toBe(403);
    const expired = await ServerAuth.open(
      f.runtime.kernel,
      f.snapshot.space.id,
      () => Date.now() + 8 * 24 * 60 * 60 * 1000,
    );
    await expect(expired.authenticate(f.getToken().split("=", 2)[1])).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
    await expect(f.login("admin", "incorrect-password")).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
    expect((await f.fetch("https://example.test/api/logout", { method: "POST" })).status).toBe(200);
    await expect(f.command("snapshot")).rejects.toMatchObject({ code: "AUTH.REQUIRED" });
  });

  it("uses the configured public origin behind a proxy without weakening the origin check", async () => {
    const f = await fixture();
    const handler = createServerHandler(f.runtime, { origin: "http://public.test" });
    const response = await handler(
      new Request("https://internal.test/api/login", {
        method: "POST",
        headers: { origin: "http://public.test", "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "correct-password-for-test" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("; Secure");
  });

  it("seals API keys at rest and never returns plaintext to the browser", async () => {
    const path = await directory();
    const f = await fixture(path);
    await f.command("assistant.put", {
      baseUrl: "https://provider.test/v1",
      model: "test",
      apiKey: "very-secret-provider-key",
    });
    expect(await f.command("assistant.get")).toEqual({
      baseUrl: "https://provider.test/v1",
      model: "test",
      apiKey: "••••••••",
    });
    await f.command("assistant.put", {
      baseUrl: "https://provider.test/v1",
      model: "another",
      apiKey: "••••••••",
    });
    const identity = await f.runtime.auth.authenticate(f.getToken().split("=", 2)[1]);
    expect(((await f.command("assistant.get")) as { model: string }).model).toBe("another");
    expect(identity.login.hash).not.toContain("correct-password-for-test");
    expect(
      (await readFile(join(path, "catalog.db"))).includes(Buffer.from("very-secret-provider-key")),
    ).toBe(false);
  });

  it("streams inference and allows concurrent users without sharing selected-app state", async () => {
    const f = await fixture(undefined, {
      async *run(context) {
        yield { type: "started" };
        yield { type: "text_delta", step: 0, delta: context.execution.actorId };
        yield { type: "completed", output: context.execution.workspaceId };
      },
    });
    const events = [];
    for await (const event of await f
      .client(f.snapshot)
      .runInference({ messages: [{ role: "user", content: "Hi" }] }))
      events.push(event);
    expect(events).toEqual([
      { type: "started" },
      { type: "text_delta", step: 0, delta: f.snapshot.actorId },
      { type: "completed", output: f.snapshot.app.id },
    ]);
    const records = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        f
          .command("snapshot", {}, f.snapshot.selection)
          .then((snapshot) => ({ index, id: (snapshot as RemoteSnapshot).app.id })),
      ),
    );
    expect(records.every(({ id }) => id === f.snapshot.app.id)).toBe(true);
  });

  it("excludes a second writer process/instance without leaving stale lock files after close", async () => {
    const path = await directory();
    const f = await fixture(path);
    await expect(ServerRuntime.open({ directory: path })).rejects.toMatchObject({
      code: "PERSISTENCE.LOCKED",
      message: expect.stringContaining("already in use"),
      cause: expect.objectContaining({ errcode: 5 }),
    });
    await f.runtime.close();
    const reopened = await fixture(path);
    expect(reopened.snapshot.app.id).toBe(f.snapshot.app.id);
  });

  it("keeps contextual assistant tools bound to each concurrent Actor and selected App", async () => {
    let entered = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await fixture(undefined, {
      async *run(context) {
        yield { type: "started" };
        const offered = await context.tools.resolve({
          execution: context.execution,
          actor: context.actor,
          messages: context.messages,
          step: 0,
          activeToolIds: new Set(["builder:get_spec"]),
          metadata: { surface: "assistant" },
        });
        if (++entered === 2) release();
        await ready;
        const spec = await offered.execute({
          id: "inspect",
          toolId: "builder:get_spec",
          input: {},
        });
        yield { type: "completed", output: spec };
      },
    });
    const second = (await f.command(
      "createApp",
      { name: "Other App" },
      f.snapshot.selection,
    )) as RemoteSnapshot;
    const root = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: f.snapshot.space.id,
      actorId: f.snapshot.actorId,
    });
    const member = await root.createMember({ name: "Reader", permissions: ["read"] });
    const app = await createWorkspaceClient(f.runtime.kernel, {
      workspaceId: second.app.id,
      actorId: f.snapshot.actorId,
    });
    await app.addMembership({
      actorId: member.actor.id,
      workspaceId: second.app.id,
      permissions: ["read"],
    });
    await f.runtime.auth.createLogin(f.snapshot.space.id, "reader", "reader-password-for-test", {
      [f.snapshot.space.id]: member.actor.id,
    });
    const token = await f.runtime.auth.login("reader", "reader-password-for-test");
    const reader = createHttpWorkspaceClient({
      url: `https://example.test/api/workspaces/${second.space.id}?${new URLSearchParams({ spaceId: second.space.id, appId: second.app.id })}`,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        request.headers.set("origin", "https://example.test");
        request.headers.set("cookie", `builder_session=${token}`);
        return f.handle(request);
      },
    });
    const consume = async (client: ReturnType<typeof createHttpWorkspaceClient>) => {
      let output: unknown;
      for await (const event of await client.runInference({
        messages: [{ role: "user", content: "Inspect" }],
        metadata: { surface: "assistant" },
      })) {
        if (event.type === "failed") throw new Error(JSON.stringify(event.error));
        if (event.type === "completed") output = event.output;
      }
      return output;
    };
    const owner = createHttpWorkspaceClient({
      url: `https://example.test/api/workspaces/${f.snapshot.space.id}?${new URLSearchParams({ spaceId: f.snapshot.space.id, appId: f.snapshot.app.id })}`,
      fetch: f.fetch,
    });
    const outputs = await Promise.all([consume(owner), consume(reader)]);
    expect(outputs[0]).toMatchObject({ id: f.snapshot.app.spec.id });
    expect(outputs[1]).toMatchObject({ id: second.app.spec.id });
  });
});
