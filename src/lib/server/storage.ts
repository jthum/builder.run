import { mkdir, readFile, writeFile, rm, stat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { SqlitePersistenceAdapter } from "@jthum/framework/sqlite";
import { openNodeSqlite } from "@jthum/framework/sqlite/node";
import { createAesGcmSecretCipher } from "@jthum/framework/kernel";
import type { CatalogRepository } from "@jthum/framework/persistence";
import {
  CATALOG_DATABASE,
  workspaceDatabaseName,
  scopeDatabaseName,
} from "$lib/framework/sqlite.ts";

export async function openServerStorage(directory: string) {
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  // One exclusive host process owns schema changes, recovery and the consistent multi-file layout.
  const lease = openNodeSqlite(join(root, ".server-lock.db"));
  try {
    await lease.execute("BEGIN EXCLUSIVE");
  } catch {
    await lease.close();
    throw new Error("The data directory is already in use by another server.");
  }
  try {
    const keyPath = join(root, "secret.key");
    try {
      await writeFile(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!isExists(error)) throw error;
    }
    const key = await readFile(keyPath);
    if (key.length !== 32) throw new Error("The server secret key must contain exactly 32 bytes.");
    const open = (name: string) => openNodeSqlite(join(root, name));
    const adapter = new SqlitePersistenceAdapter(() => open(CATALOG_DATABASE), {
      workspaceDatabases: {
        open: ({ workspaceId }) => open(workspaceDatabaseName(workspaceId)),
        remove: ({ workspaceId }) =>
          rm(join(root, workspaceDatabaseName(workspaceId)), { force: true }),
      },
      scopeDatabases: {
        open: ({ workspaceId, scope }) =>
          open(scopeDatabaseName(workspaceId, scope.kind, scope.id)),
        remove: ({ workspaceId, scope }) =>
          rm(join(root, scopeDatabaseName(workspaceId, scope.kind, scope.id)), { force: true }),
      },
    });
    let catalog: CatalogRepository | undefined;
    const persistence = {
      kind: "sqlite",
      async open() {
        const session = await adapter.open();
        catalog = session.catalog;
        return session;
      },
    };
    return {
      persistence,
      catalog: () => {
        if (!catalog) throw new Error("Server storage has not opened.");
        return catalog;
      },
      secretCipher: createAesGcmSecretCipher(() =>
        crypto.subtle.importKey("raw", new Uint8Array(key), "AES-GCM", false, [
          "encrypt",
          "decrypt",
        ]),
      ),
      release: () => lease.close(),
      async inspect() {
        return Promise.all(
          (await readdir(root))
            .filter((name) => !name.startsWith(".") && name.endsWith(".db"))
            .map(async (name) => ({
              name,
              bytes: (await stat(join(root, name))).size,
              open: true,
            })),
        );
      },
      async readRealm(): Promise<string | undefined> {
        try {
          return (await readFile(join(root, "login.realm"), "utf8")).trim();
        } catch (error) {
          if (typeof error === "object" && error && "code" in error && error.code === "ENOENT")
            return undefined;
          throw error;
        }
      },
      saveRealm: (id: string) =>
        writeFile(join(root, "login.realm"), id, { flag: "wx", mode: 0o600 }),
    };
  } catch (error) {
    await lease.close();
    throw error;
  }
}

function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
