import { applyDefaults } from "./defaults.ts";
import type { Actor, AppSpec, StoreDef, TypeDef } from "./model.ts";
import { nowIso, normalizeSpec } from "./model.ts";
import type { EnvironmentState, PlatformState, WorkspaceState } from "./platform.ts";
import type { SqlConnection } from "./sql-gateway.ts";

const CATALOG_SQL = `
CREATE TABLE IF NOT EXISTS br_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS br_environment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_workspace_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS br_actor (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  roles TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS br_store (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS br_workspace (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  spec TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS br_shared_types (
  environment_id TEXT PRIMARY KEY,
  types TEXT NOT NULL
);
`;

export async function ensureCatalog(conn: SqlConnection): Promise<void> {
  await conn.exec(CATALOG_SQL);
}

export async function loadPlatform(conn: SqlConnection): Promise<PlatformState | null> {
  await ensureCatalog(conn);
  const envs = await conn.query(`SELECT * FROM br_environment ORDER BY created_at`);
  if (!envs.length) return null;
  const active = await conn.query(`SELECT value FROM br_kv WHERE key = 'active_environment_id'`);
  const environments: EnvironmentState[] = [];
  for (const env of envs) {
    environments.push(await loadEnvironment(conn, String(env.id)));
  }
  return {
    version: 1,
    activeEnvironmentId: String(active[0]?.value ?? environments[0].id),
    environments,
  };
}

export async function savePlatform(conn: SqlConnection, platform: PlatformState): Promise<void> {
  await ensureCatalog(conn);
  await conn.exec("BEGIN");
  try {
    const stamp = nowIso();
    const envIds = platform.environments.map((env) => env.id);
    for (const env of platform.environments) {
      await conn.exec(
        `INSERT INTO br_environment (id, name, active_workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           active_workspace_id = excluded.active_workspace_id,
           updated_at = excluded.updated_at`,
        [env.id, env.name, env.activeWorkspaceId, stamp, stamp],
      );
      for (const actor of env.actors) {
        await conn.exec(
          `INSERT INTO br_actor (id, environment_id, name, kind, roles) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, roles = excluded.roles`,
          [actor.id, env.id, actor.name, actor.kind, JSON.stringify(actor.roles)],
        );
      }
      for (const store of env.stores) {
        await conn.exec(
          `INSERT INTO br_store (id, environment_id, key, label, kind) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET key = excluded.key, label = excluded.label, kind = excluded.kind`,
          [store.id, env.id, store.key, store.label, store.kind],
        );
      }
      for (const workspace of env.workspaces) {
        await conn.exec(
          `INSERT INTO br_workspace (id, environment_id, name, spec) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, spec = excluded.spec`,
          [workspace.id, env.id, workspace.name, JSON.stringify(workspace.spec)],
        );
      }
      await conn.exec(
        `INSERT INTO br_shared_types (environment_id, types) VALUES (?, ?)
         ON CONFLICT(environment_id) DO UPDATE SET types = excluded.types`,
        [env.id, JSON.stringify(env.sharedTypes)],
      );
      await deleteMissing(
        conn,
        "br_actor",
        "environment_id",
        env.id,
        env.actors.map((item) => item.id),
      );
      await deleteMissing(
        conn,
        "br_store",
        "environment_id",
        env.id,
        env.stores.map((item) => item.id),
      );
      await deleteMissing(
        conn,
        "br_workspace",
        "environment_id",
        env.id,
        env.workspaces.map((item) => item.id),
      );
    }
    if (envIds.length) {
      await conn.exec(
        `DELETE FROM br_environment WHERE id NOT IN (${envIds.map(() => "?").join(",")})`,
        envIds,
      );
      await conn.exec(
        `DELETE FROM br_shared_types WHERE environment_id NOT IN (${envIds.map(() => "?").join(",")})`,
        envIds,
      );
    }
    await conn.exec(
      `INSERT INTO br_kv (key, value) VALUES ('active_environment_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [platform.activeEnvironmentId],
    );
    await conn.exec("COMMIT");
  } catch (error) {
    try {
      await conn.exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}

async function deleteMissing(
  conn: SqlConnection,
  table: string,
  parentColumn: string,
  parentId: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) {
    await conn.exec(`DELETE FROM ${table} WHERE ${parentColumn} = ?`, [parentId]);
    return;
  }
  await conn.exec(
    `DELETE FROM ${table} WHERE ${parentColumn} = ? AND id NOT IN (${ids.map(() => "?").join(",")})`,
    [parentId, ...ids],
  );
}

async function loadEnvironment(conn: SqlConnection, id: string): Promise<EnvironmentState> {
  const envRows = await conn.query(`SELECT * FROM br_environment WHERE id = ?`, [id]);
  const env = envRows[0];
  if (!env) throw new Error(`Environment ${id} not found`);
  const actors = (await conn.query(`SELECT * FROM br_actor WHERE environment_id = ?`, [id])).map(
    (row) =>
      ({
        id: String(row.id),
        name: String(row.name),
        kind: row.kind as Actor["kind"],
        roles: JSON.parse(String(row.roles)),
      }) satisfies Actor,
  );
  const stores = (await conn.query(`SELECT * FROM br_store WHERE environment_id = ?`, [id])).map(
    (row) =>
      ({
        id: String(row.id),
        key: String(row.key),
        label: String(row.label),
        kind: row.kind as StoreDef["kind"],
      }) satisfies StoreDef,
  );
  const workspaces: WorkspaceState[] = [];
  for (const row of await conn.query(`SELECT * FROM br_workspace WHERE environment_id = ?`, [id])) {
    const spec = applyDefaults(normalizeSpec(JSON.parse(String(row.spec)) as AppSpec));
    workspaces.push({ id: String(row.id), name: String(row.name), spec });
  }
  const sharedRows = await conn.query(
    `SELECT types FROM br_shared_types WHERE environment_id = ?`,
    [id],
  );
  const sharedTypes = JSON.parse(String(sharedRows[0]?.types ?? "[]")) as TypeDef[];
  return {
    id: String(env.id),
    name: String(env.name),
    actors,
    stores,
    sharedTypes,
    workspaces,
    activeWorkspaceId: String(env.active_workspace_id ?? workspaces[0]?.id ?? ""),
  };
}
