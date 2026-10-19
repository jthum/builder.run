import { Kernel } from "@jthum/framework/kernel";
import { invalidInput } from "@jthum/framework/errors";
import { createSpace, emptySpec } from "$lib/framework/bootstrap.ts";
import { ServerAuth, validateCredentials } from "./auth.ts";
import { openServerStorage } from "./storage.ts";

export interface SetupInput {
  readonly name: string;
  readonly username: string;
  readonly password: string;
  readonly spaceName?: string;
}

/** Trusted, one-time provisioning. The input callback runs only after an empty-instance check. */
export async function setupServer(directory: string, input: SetupInput | (() => Promise<unknown>)) {
  const storage = await openServerStorage(directory);
  let kernel: Kernel | undefined;
  try {
    if (await storage.readRealm())
      throw new Error("This instance is already set up. Manage users and passwords in the app.");
    kernel = await Kernel.open({
      persistence: storage.persistence,
      secretCipher: storage.secretCipher,
    });
    await assertEmptySetup(storage);
    const value = typeof input === "function" ? await input() : input;
    const { spaceId, actorId } = await provisionServer(kernel, storage, value);
    return { spaceId, actorId };
  } finally {
    try {
      await kernel?.close();
    } finally {
      await storage.release();
    }
  }
}

type Storage = Awaited<ReturnType<typeof openServerStorage>>;

export async function assertEmptySetup(storage: Storage): Promise<void> {
  if ((await storage.catalog().listRootWorkspaces()).length)
    throw new Error(
      "This directory already contains instance data. Setup will not overwrite it. Use a new data directory or restore a complete backup.",
    );
}

/** Shared by browser onboarding and the optional CLI; caller owns the storage lease. */
export async function provisionServer(kernel: Kernel, storage: Storage, value: unknown) {
  await assertEmptySetup(storage);
  const input = readSetupInput(value);
  const spaceName = input.spaceName ?? "My Space";
  const created = await createSpace(kernel, {
    spaceName,
    appName: "Home",
    user: { name: input.name },
    spaceSpec: emptySpec("space", spaceName),
    appSpec: emptySpec("home", "Home"),
  });
  const auth = await ServerAuth.open(kernel, created.space.id);
  await auth.createLogin(created.space.id, input.username, input.password, {
    [created.space.id]: created.actorId,
  });
  // Completion marker comes last: a partial setup is never served as an initialized instance.
  await storage.saveRealm(created.space.id);
  return { spaceId: created.space.id, actorId: created.actorId, auth };
}

function readSetupInput(value: unknown): SetupInput {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["name", "username", "password", "spaceName"].includes(key),
    ) ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !("username" in value) ||
    typeof value.username !== "string" ||
    !("password" in value) ||
    typeof value.password !== "string" ||
    ("spaceName" in value &&
      value.spaceName !== undefined &&
      (typeof value.spaceName !== "string" || !value.spaceName.trim()))
  )
    throw invalidInput("Provide your name, username, password and an optional Space name.");
  return {
    name: value.name.trim(),
    username: validateCredentials(value.username, value.password),
    password: value.password,
    ...("spaceName" in value && typeof value.spaceName === "string"
      ? { spaceName: value.spaceName.trim() }
      : {}),
  };
}
