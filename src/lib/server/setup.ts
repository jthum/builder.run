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
export async function setupServer(
  directory: string,
  input: SetupInput | (() => Promise<SetupInput>),
) {
  const storage = await openServerStorage(directory);
  let kernel: Kernel | undefined;
  try {
    if (await storage.readRealm())
      throw new Error("This instance is already set up. Manage users and passwords in the app.");
    kernel = await Kernel.open({
      persistence: storage.persistence,
      secretCipher: storage.secretCipher,
    });
    if ((await storage.catalog().listRootWorkspaces()).length)
      throw new Error(
        "This directory already contains instance data. Setup will not overwrite it. Use a new data directory or restore a complete backup.",
      );
    const value = typeof input === "function" ? await input() : input;
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      typeof value.username !== "string" ||
      typeof value.password !== "string" ||
      (value.spaceName !== undefined &&
        (typeof value.spaceName !== "string" || !value.spaceName.trim()))
    )
      throw invalidInput("Provide your name, username, password and an optional Space name.");
    const username = validateCredentials(value.username, value.password);
    const spaceName = value.spaceName?.trim() ?? "My Space";
    const created = await createSpace(kernel, {
      spaceName,
      appName: "Home",
      user: { name: value.name.trim() },
      spaceSpec: emptySpec("space", spaceName),
      appSpec: emptySpec("home", "Home"),
    });
    const auth = await ServerAuth.open(kernel, created.space.id);
    await auth.createLogin(created.space.id, username, value.password, {
      [created.space.id]: created.actorId,
    });
    // Completion marker comes last: a partial setup is never served as an initialized instance.
    await storage.saveRealm(created.space.id);
    return { spaceId: created.space.id, actorId: created.actorId };
  } finally {
    try {
      await kernel?.close();
    } finally {
      await storage.release();
    }
  }
}
