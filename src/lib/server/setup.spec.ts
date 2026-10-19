import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { Kernel } from "@jthum/framework/kernel";
import { setupServer } from "./setup.ts";
import { promptSetup, runSetupCommand } from "./setup-command.ts";
import { ServerRuntime } from "./runtime.ts";
import { openServerStorage } from "./storage.ts";
import { directory, cleanupServerFixtures } from "./testing.ts";

afterEach(cleanupServerFixtures);
const owner = {
  name: "Ada",
  username: "ada",
  password: "a-strong-password-for-test",
  spaceName: "Ada's Space",
};

class TerminalInput extends PassThrough {
  readonly isTTY = true;
  isRaw = false;
  setRawMode(value: boolean) {
    this.isRaw = value;
    return this;
  }
}

function terminal(answers: readonly string[]) {
  const input = new TerminalInput();
  let transcript = "";
  let answered = 0;
  const questions = [
    "Space name [My Space]: ",
    "Your name: ",
    "Username: ",
    "Password (at least 12 characters): ",
    "Confirm password: ",
  ];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      transcript += String(chunk);
      if (answered < answers.length && transcript.includes(questions[answered]!)) {
        const value = answers[answered++]!;
        setImmediate(() => input.write(value));
      }
      callback();
    },
  });
  Object.defineProperty(output, "isTTY", { value: true });
  return { input, output, transcript: () => transcript };
}

describe("native server setup", () => {
  it("opens fresh storage for onboarding and creates only the explicitly chosen owner during setup", async () => {
    const path = await directory();
    const fresh = await ServerRuntime.open({ directory: path });
    expect(fresh.setupRequired).toBe(true);
    await fresh.close();
    const created = await setupServer(path, owner);
    const runtime = await ServerRuntime.open({ directory: path });
    try {
      const identity = await runtime.auth.authenticate(
        await runtime.auth.login("ada", owner.password),
      );
      expect(identity.login.actorId).toBe(created.actorId);
      const context = await runtime.context(identity);
      expect(context.space.name).toBe(owner.spaceName);
      expect(
        (await context.spaceClient.listActorsByOrigin())
          .filter((actor) => actor.kind === "user")
          .map((actor) => actor.name),
      ).toEqual(["Ada"]);
      expect(
        (await context.spaceClient.listMembershipsForWorkspace()).find(
          (membership) => membership.actorId === created.actorId,
        )?.permissions,
      ).toContain("manage");
      await expect(runtime.auth.login("admin", owner.password)).rejects.toHaveProperty(
        "code",
        "AUTH.REQUIRED",
      );
    } finally {
      await runtime.close();
    }
  });

  it("never prompts again or resets credentials for an existing instance", async () => {
    const path = await directory();
    const created = await setupServer(path, owner);
    const key = await readFile(join(path, "secret.key"));
    let prompted = false;
    await expect(
      setupServer(path, async () => {
        prompted = true;
        return { ...owner, password: "different-password-for-test" };
      }),
    ).rejects.toThrow("already set up");
    expect(prompted).toBe(false);
    expect(await readFile(join(path, "secret.key"))).toEqual(key);
    expect((await readFile(join(path, "login.realm"), "utf8")).trim()).toBe(created.spaceId);
    const runtime = await ServerRuntime.open({ directory: path });
    try {
      expect(await runtime.auth.login(owner.username, owner.password)).toBeTruthy();
      await expect(
        runtime.auth.login(owner.username, "different-password-for-test"),
      ).rejects.toHaveProperty("code", "AUTH.REQUIRED");
    } finally {
      await runtime.close();
    }
  });

  it("rejects bad input before creating Workspaces and releases storage for another attempt", async () => {
    const path = await directory();
    await expect(setupServer(path, { ...owner, password: "short" })).rejects.toHaveProperty(
      "code",
      "VALIDATION.INVALID_INPUT",
    );
    const fresh = await ServerRuntime.open({ directory: path });
    expect(fresh.setupRequired).toBe(true);
    await fresh.close();
    const created = await setupServer(path, owner);
    expect(created.spaceId).toBeTruthy();
  });

  it("validates untrusted setup data without accepting arrays, wrong types or unknown keys", async () => {
    const path = await directory();
    for (const value of [
      null,
      [],
      "not an object",
      { ...owner, name: 7 },
      { ...owner, username: null },
      { ...owner, password: { value: owner.password } },
      { ...owner, spaceName: false },
      { ...owner, actorId: "not-authority" },
    ])
      await expect(setupServer(path, async () => value)).rejects.toHaveProperty(
        "code",
        "VALIDATION.INVALID_INPUT",
      );
    expect((await setupServer(path, owner)).actorId).toBeTruthy();
  });

  it("refuses to overwrite partial instance data even without a completion marker", async () => {
    const path = await directory();
    const storage = await openServerStorage(path);
    const kernel = await Kernel.open({ persistence: storage.persistence });
    const root = await kernel.createRootWorkspace({
      name: "Keep me",
      user: { name: "Existing user" },
    });
    await kernel.close();
    await storage.release();
    let prompted = false;
    await expect(
      setupServer(path, async () => {
        prompted = true;
        return owner;
      }),
    ).rejects.toThrow("will not overwrite");
    expect(prompted).toBe(false);
    const reopened = await openServerStorage(path);
    const session = await reopened.persistence.open();
    try {
      expect((await session.catalog.listRootWorkspaces()).map((workspace) => workspace.id)).toEqual(
        [root.workspace.id],
      );
    } finally {
      await session.close();
      await reopened.release();
    }
  });

  it("takes private JSON on stdin for automation and does not echo credentials", async () => {
    const path = await directory();
    const input = new PassThrough();
    let output = "";
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    input.end(JSON.stringify(owner));
    await runSetupCommand(path, ["--stdin"], { input, output: sink });
    expect(output).toContain("Setup complete");
    expect(output).not.toContain(owner.password);
    const runtime = await ServerRuntime.open({ directory: path });
    try {
      expect(await runtime.auth.login(owner.username, owner.password)).toBeTruthy();
    } finally {
      await runtime.close();
    }
  });

  it("masks both passwords and restores terminal input mode", async () => {
    const io = terminal(["\n", "Ada\n", "ada\n", `${owner.password}\n`, `${owner.password}\n`]);
    const result = await promptSetup(io);
    expect(result).toEqual({ ...owner, spaceName: "My Space" });
    expect(io.transcript()).not.toContain(owner.password);
    expect(io.transcript()).toContain("Confirm password:");
    expect(io.input.isRaw).toBe(false);
  });

  it("handles confirmation failures and cancellation without storing users or leaking passwords", async () => {
    for (const last of ["different-password\n", "\u0003"]) {
      const path = await directory();
      const io = terminal(["\n", "Ada\n", "ada\n", `${owner.password}\n`, last]);
      await expect(runSetupCommand(path, [], io)).rejects.toBeInstanceOf(Error);
      expect(io.transcript()).not.toContain(owner.password);
      expect(io.transcript()).not.toContain("different-password");
      expect(io.input.isRaw).toBe(false);
      const fresh = await ServerRuntime.open({ directory: path });
      expect(fresh.setupRequired).toBe(true);
      await fresh.close();
      expect((await setupServer(path, owner)).actorId).toBeTruthy();
    }
  });

  it("requires an explicit stdin option and redacts malformed or oversized JSON errors", async () => {
    for (const [args, text, message] of [
      [[], JSON.stringify(owner), "requires a terminal"],
      [["--stdin"], `{"password":"${owner.password}",`, "valid JSON"],
      [["--stdin"], "x".repeat(17 * 1024), "16 KiB"],
      [["--password", owner.password], "", "Unrecognized setup option"],
    ] as const) {
      const path = await directory();
      const input = new PassThrough();
      input.end(text);
      const output = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });
      await expect(runSetupCommand(path, args, { input, output })).rejects.toThrow(message);
    }
  });
});
