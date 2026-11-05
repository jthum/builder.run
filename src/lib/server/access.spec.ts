import { afterEach, describe, expect, it } from "vite-plus/test";
import { PERMISSIONS, type Permission } from "@jthum/framework/kernel";
import type { PeopleInfo, SecurityInfo } from "$lib/app/access.ts";
import type { RemoteSnapshot } from "$lib/app/remote-contract.ts";
import { cleanupServerFixtures, directory, fixture, testBrowser } from "./testing.ts";

afterEach(cleanupServerFixtures);
const password = "colleague-password-for-test";

it("paginates and filters the server roster before adding page-local login and App metadata", async () => {
  const f = await fixture();
  await addUser(f, "directory-anna");
  await addUser(f, "directory-beth", ["read", "manage"]);
  await addUser(f, "directory-cara");
  const page = (await f.command(
    "people.list",
    { search: "DIRECTORY-", limit: 1, offset: 1, sort: "name_asc" },
    f.snapshot.selection,
  )) as PeopleInfo;
  expect(page).toMatchObject({ total: 3, limit: 1, offset: 1 });
  expect(page.people.map((person) => person.username)).toEqual(["directory-beth"]);
  expect(page.people[0]?.apps).toEqual([{ appId: f.snapshot.app.id, permissions: ["read"] }]);
  const filtered = (await f.command(
    "people.list",
    { search: "directory-", permission: "manage", memberOf: f.snapshot.app.id },
    f.snapshot.selection,
  )) as PeopleInfo;
  expect(filtered.total).toBe(1);
  expect(filtered.people[0]?.username).toBe("directory-beth");
  const client = f.client(f.snapshot);
  expect((await client.queryMembers({ search: "directory-", limit: 1 })).total).toBe(3);
  await expect(
    f.command("people.list", { limit: 10000 }, f.snapshot.selection),
  ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
});

async function addUser(
  f: Awaited<ReturnType<typeof fixture>>,
  username = "colleague",
  permissions: readonly Permission[] = ["read"],
  appPermissions: readonly Permission[] = ["read"],
) {
  const info = (await f.command(
    "people.create",
    {
      name: username,
      username,
      password,
      permissions,
      apps: [{ appId: f.snapshot.app.id, permissions: appPermissions }],
    },
    f.snapshot.selection,
  )) as PeopleInfo;
  return info.people.find((person) => person.username === username)!;
}

async function addNotes(f: Awaited<ReturnType<typeof fixture>>) {
  await f.client(f.snapshot).applySpec({
    ...f.snapshot.app.spec,
    collections: [
      {
        id: "notes",
        key: "note",
        label: "Note",
        fields: [{ id: "title", key: "title", label: "Title", type: "text" }],
      },
    ],
  });
}

describe("People and access", () => {
  it("uses the current Workspace permission ceiling for snapshots and administration", async () => {
    const f = await fixture();
    await f
      .client(f.snapshot, f.snapshot.space.id)
      .updateWorkspaceAccess({ members: ["read"], others: [] });
    const snapshot = (await f.command("snapshot", {}, f.snapshot.selection)) as RemoteSnapshot;
    expect(snapshot.permissions.space).toEqual(["read"]);
    expect(snapshot.actor.roles).toEqual(["member"]);
    expect(snapshot.actor.id).toBe(snapshot.actorId);
    expect(snapshot).not.toHaveProperty("actors");
    expect(snapshot.databases).toEqual([]);
    await expect(f.command("people.list", {}, snapshot.selection)).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
  });

  it("issues separate realm-local logins with the same username and isolates session revocation", async () => {
    const f = await fixture();
    const first = await addUser(f);
    const otherSpace = (await f.command(
      "createSpace",
      { name: "Recruiting" },
      f.snapshot.selection,
    )) as RemoteSnapshot;
    const info = (await f.command(
      "people.create",
      { name: "Candidate", username: "colleague", password },
      otherSpace.selection,
    )) as PeopleInfo;
    const candidate = info.people.find((person) => person.username === "colleague")!;
    expect(candidate.actor.originId).toBe(otherSpace.space.id);
    expect(candidate.actor.id).not.toBe(first.actor.id);
    expect(info.signInUrl).toContain(otherSpace.space.id);
    expect(info.people.some((person) => person.actor.id === first.actor.id)).toBe(false);
    const rootBrowser = testBrowser(f.handle);
    const candidateBrowser = testBrowser(f.handle);
    await rootBrowser.login("colleague", password);
    await candidateBrowser.login("colleague", password, otherSpace.space.id);
    expect(((await candidateBrowser.command("snapshot")) as RemoteSnapshot).actorId).toBe(
      candidate.actor.id,
    );
    await expect(
      candidateBrowser.command("snapshot", {}, f.snapshot.selection),
    ).rejects.toMatchObject({ code: "AUTH.REQUIRED" });
    await f.command("people.revokeSessions", { actorId: candidate.actor.id }, otherSpace.selection);
    await expect(candidateBrowser.command("security.get")).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
    expect(((await rootBrowser.command("snapshot")) as RemoteSnapshot).actorId).toBe(
      first.actor.id,
    );
  });

  it("defaults to read-only, applies permission changes to existing clients, and denies escalation", async () => {
    const f = await fixture();
    await addNotes(f);
    const person = await addUser(f);
    expect(person.permissions).toEqual(["read"]);
    expect(person.apps[0]?.permissions).toEqual(["read"]);
    const browser = testBrowser(f.handle);
    await browser.login("colleague", password);
    const snapshot = (await browser.command("snapshot")) as RemoteSnapshot;
    const client = browser.client(snapshot);
    expect(snapshot.permissions).toEqual({ space: ["read"], app: ["read"] });
    await expect(client.createRecord("note", { title: "Denied" })).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
    await expect(browser.command("people.list")).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
    await expect(
      browser.command("people.update", { actorId: person.actor.id, permissions: PERMISSIONS }),
    ).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    const input = {
      actorId: person.actor.id,
      permissions: ["read"],
      apps: [{ appId: snapshot.app.id, permissions: ["read", "create", "update", "delete"] }],
    };
    await f.command("people.update", input, f.snapshot.selection);
    const note = await client.createRecord("note", { title: "Allowed" });
    expect(note.values).toMatchObject({ title: "Allowed" });
    await expect(client.applySpec(snapshot.app.spec)).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
    await f.command(
      "people.update",
      { ...input, apps: [{ appId: snapshot.app.id, permissions: ["read"] }] },
      f.snapshot.selection,
    );
    await expect(
      client.updateRecord("note", note.id, { title: "Denied again" }),
    ).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    expect((await client.getRecord("note", note.id))?.values.title).toBe("Allowed");
  });

  it("does not infer App management from Space management or leak unrelated rosters", async () => {
    const f = await fixture();
    const second = (await f.command(
      "createApp",
      { name: "Private app" },
      f.snapshot.selection,
    )) as RemoteSnapshot;
    const manager = await addUser(f, "manager", PERMISSIONS, PERMISSIONS);
    const browser = testBrowser(f.handle);
    await browser.login("manager", password);
    const info = (await browser.command("people.list", {}, f.snapshot.selection)) as PeopleInfo;
    expect(info.apps.map((app) => app.id)).toEqual([f.snapshot.app.id]);
    expect(JSON.stringify(info)).not.toContain("Private app");
    await expect(
      browser.command(
        "people.create",
        {
          name: "Unexpected",
          username: "unexpected",
          password,
          apps: [{ appId: second.app.id, permissions: PERMISSIONS }],
        },
        f.snapshot.selection,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    const otherSpace = (await f.command(
      "createSpace",
      { name: "Unrelated Space" },
      f.snapshot.selection,
    )) as RemoteSnapshot;
    await expect(
      f.command(
        "people.update",
        {
          actorId: manager.actor.id,
          permissions: ["read"],
          apps: [{ appId: otherSpace.app.id, permissions: PERMISSIONS }],
        },
        f.snapshot.selection,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE.NOT_FOUND" });
    await expect(
      f.command(
        "people.update",
        { actorId: otherSpace.actorId, permissions: [] },
        f.snapshot.selection,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE.NOT_FOUND" });
    const unchanged = (await browser.command(
      "people.list",
      {},
      f.snapshot.selection,
    )) as PeopleInfo;
    expect(
      unchanged.people.find((person) => person.actor.id === manager.actor.id)?.permissions,
    ).toEqual(PERMISSIONS);
    await expect(
      browser.command("people.remove", { actorId: manager.actor.id }, f.snapshot.selection),
    ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
  });

  it("blocks direct App requests and revision polls after Space access is removed without logging out", async () => {
    const f = await fixture();
    const person = await addUser(f);
    const browser = testBrowser(f.handle);
    await browser.login("colleague", password);
    const snapshot = (await browser.command("snapshot")) as RemoteSnapshot;
    const client = browser.client(snapshot);
    expect((await client.getWorkspace()).id).toBe(snapshot.app.id);
    // Keep the login/session and child membership unchanged to prove the host entry check.
    const root = f.client(f.snapshot, f.snapshot.space.id);
    await root.updateMembership({
      actorId: person.actor.id,
      workspaceId: snapshot.space.id,
      permissions: [],
    });
    expect(
      (await root.listMembershipsForActor(person.actor.id)).find(
        (membership) => membership.workspaceId === snapshot.app.id,
      )?.permissions,
    ).toEqual(["read"]);
    await expect(client.getWorkspace()).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    await expect(browser.command("revision", {}, snapshot.selection)).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
    await expect(browser.command("snapshot", {}, snapshot.selection)).rejects.toMatchObject({
      code: "PERMISSION.DENIED",
    });
    expect(((await browser.command("security.get")) as SecurityInfo).username).toBe("colleague");
  });

  it("signs out a removed user, preserves their Actor, and allows explicit restoration", async () => {
    const f = await fixture();
    const person = await addUser(f);
    const browser = testBrowser(f.handle);
    await browser.login("colleague", password);
    const snapshot = (await browser.command("snapshot")) as RemoteSnapshot;
    const info = (await f.command(
      "people.remove",
      { actorId: person.actor.id },
      f.snapshot.selection,
    )) as PeopleInfo;
    expect(info.people.find((entry) => entry.actor.id === person.actor.id)?.permissions).toEqual(
      [],
    );
    await expect(browser.client(snapshot).getWorkspace()).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
    await browser.login("colleague", password);
    await expect(browser.command("snapshot")).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    await f.command(
      "people.update",
      { actorId: person.actor.id, permissions: ["read"] },
      f.snapshot.selection,
    );
    expect(((await browser.command("snapshot")) as RemoteSnapshot).actorId).toBe(person.actor.id);
  });

  it("rejects invalid or out-of-boundary grants before creating any Actor", async () => {
    const f = await fixture();
    const before = (await f.command("people.list", {}, f.snapshot.selection)) as PeopleInfo;
    for (const input of [
      { permissions: ["invented"] },
      { permissions: ["manage"] },
      { apps: [] },
      { apps: [{ appId: f.snapshot.space.id, permissions: ["read"] }] },
      {
        apps: [
          { appId: f.snapshot.app.id, permissions: ["read"] },
          { appId: f.snapshot.app.id, permissions: ["read"] },
        ],
      },
    ])
      await expect(
        f.command(
          "people.create",
          { name: "Invalid", username: "invalid", password, ...input },
          f.snapshot.selection,
        ),
      ).rejects.toHaveProperty("code");
    expect(
      ((await f.command("people.list", {}, f.snapshot.selection)) as PeopleInfo).people,
    ).toEqual(before.people);
  });

  it("rejects a previously offered assistant tool after session revocation", async () => {
    let offered!: () => void;
    const ready = new Promise<void>((resolve) => {
      offered = resolve;
    });
    let proceed!: () => void;
    const released = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    const f = await fixture(undefined, {
      async *run(context) {
        yield { type: "started" };
        const tools = await context.tools.resolve({
          execution: context.execution,
          actor: context.actor,
          messages: context.messages,
          step: 0,
          activeToolIds: new Set(["builder:get_spec"]),
          metadata: { surface: "assistant" },
        });
        offered();
        await released;
        const output = await tools.execute({
          id: "old-call",
          toolId: "builder:get_spec",
          input: {},
        });
        yield { type: "completed", output };
      },
    });
    const person = await addUser(f);
    const browser = testBrowser(f.handle);
    await browser.login("colleague", password);
    const snapshot = (await browser.command("snapshot")) as RemoteSnapshot;
    const consume = async () => {
      const events = [];
      for await (const event of await browser.client(snapshot, snapshot.space.id).runInference({
        messages: [{ role: "user", content: "Inspect" }],
        metadata: { surface: "assistant" },
      }))
        events.push(event);
      return events;
    };
    const result = consume().then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await ready;
      await f.command("people.revokeSessions", { actorId: person.actor.id }, f.snapshot.selection);
    } finally {
      proceed();
    }
    expect(await result).toMatchObject({ code: "AUTH.REQUIRED" });
  });
});

describe("Password and sessions", () => {
  it("requires the current password, preserves this session, and persists changes and revocations across restart", async () => {
    const path = await directory();
    const f = await fixture(path);
    await addUser(f);
    const current = testBrowser(f.handle);
    const other = testBrowser(f.handle);
    await current.login("colleague", password);
    await other.login("colleague", password);
    const before = (await current.command("security.get")) as SecurityInfo;
    expect(before.sessions).toHaveLength(2);
    expect(JSON.stringify(before)).not.toMatch(/salt|hash|secret|actors/);
    await expect(
      current.command("security.password", {
        currentPassword: "incorrect",
        password: "updated-password-for-test",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
    expect(((await other.command("security.get")) as SecurityInfo).sessions).toHaveLength(2);
    const changed = (await current.command("security.password", {
      currentPassword: password,
      password: "updated-password-for-test",
    })) as SecurityInfo;
    expect(changed.sessions).toHaveLength(1);
    expect(changed.sessions[0]?.current).toBe(true);
    await expect(other.command("security.get")).rejects.toMatchObject({ code: "AUTH.REQUIRED" });
    await expect(other.login("colleague", password)).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
    const token = current.getToken().split("=", 2)[1];
    const oldToken = other.getToken().split("=", 2)[1];
    await f.runtime.close();
    const reopened = await fixture(path);
    await expect(reopened.runtime.auth.authenticate(token)).resolves.toHaveProperty(
      "login.username",
      "colleague",
    );
    await expect(reopened.runtime.auth.authenticate(oldToken)).rejects.toMatchObject({
      code: "AUTH.REQUIRED",
    });
    const signedIn = testBrowser(reopened.handle);
    await signedIn.login("colleague", "updated-password-for-test");
    expect(((await signedIn.command("security.get")) as SecurityInfo).username).toBe("colleague");
  });

  it("revokes individual/other sessions only for the current login and lets a manager sign out a user", async () => {
    const f = await fixture();
    const person = await addUser(f);
    const browsers = [testBrowser(f.handle), testBrowser(f.handle), testBrowser(f.handle)];
    for (const browser of browsers) await browser.login("colleague", password);
    const current = browsers[0]!;
    const info = (await current.command("security.get")) as SecurityInfo;
    const ownerInfo = (await f.command("security.get")) as SecurityInfo;
    await expect(
      current.command("security.revoke", { sessionId: ownerInfo.sessions[0]!.id }),
    ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
    await expect(
      current.command("security.revoke", {
        sessionId: info.sessions.find((session) => session.current)!.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION.INVALID_INPUT" });
    const revoked = (await current.command("security.revoke", {
      sessionId: info.sessions.find((session) => !session.current)!.id,
    })) as SecurityInfo;
    expect(revoked.sessions).toHaveLength(2);
    const last = (await current.command("security.revoke")) as SecurityInfo;
    expect(last.sessions).toHaveLength(1);
    for (const browser of browsers.slice(1))
      await expect(browser.command("security.get")).rejects.toMatchObject({
        code: "AUTH.REQUIRED",
      });
    await expect(
      current.command("people.revokeSessions", { actorId: f.snapshot.actorId }),
    ).rejects.toMatchObject({ code: "PERMISSION.DENIED" });
    await f.command("people.revokeSessions", { actorId: person.actor.id }, f.snapshot.selection);
    await expect(current.command("security.get")).rejects.toMatchObject({ code: "AUTH.REQUIRED" });
    expect(((await f.command("security.get")) as SecurityInfo).sessions).toHaveLength(1);
    await current.login("colleague", password);
    expect(((await current.command("snapshot")) as RemoteSnapshot).actorId).toBe(person.actor.id);
  });
});
