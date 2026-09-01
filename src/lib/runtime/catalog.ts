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
  await conn.exec(`DELETE FROM br_actor`);
  await conn.exec(`DELETE FROM br_store`);
  await conn.exec(`DELETE FROM br_workspace`);
  await conn.exec(`DELETE FROM br_shared_types`);
  await conn.exec(`DELETE FROM br_environment`);
  const stamp = nowIso();
  for (const env of platform.environments) {
    await conn.exec(
      `INSERT INTO br_environment (id, name, active_workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [env.id, env.name, env.activeWorkspaceId, stamp, stamp],
    );
    for (const actor of env.actors) {
      await conn.exec(
        `INSERT INTO br_actor (id, environment_id, name, kind, roles) VALUES (?, ?, ?, ?, ?)`,
        [actor.id, env.id, actor.name, actor.kind, JSON.stringify(actor.roles)],
      );
    }
    for (const store of env.stores) {
      await conn.exec(
        `INSERT INTO br_store (id, environment_id, key, label, kind) VALUES (?, ?, ?, ?, ?)`,
        [store.id, env.id, store.key, store.label, store.kind],
      );
    }
    for (const workspace of env.workspaces) {
      await conn.exec(
        `INSERT INTO br_workspace (id, environment_id, name, spec) VALUES (?, ?, ?, ?)`,
        [workspace.id, env.id, workspace.name, JSON.stringify(workspace.spec)],
      );
    }
    await conn.exec(`INSERT INTO br_shared_types (environment_id, types) VALUES (?, ?)`, [
      env.id,
      JSON.stringify(env.sharedTypes),
    ]);
  }
  await conn.exec(
    `INSERT INTO br_kv (key, value) VALUES ('active_environment_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [platform.activeEnvironmentId],
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
