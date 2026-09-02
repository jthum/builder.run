import { applyDefaults } from "./defaults.ts";
import type { Actor, AppSpec } from "./model.ts";
import { nowIso, normalizeSpec } from "./model.ts";
import type { PlatformState, SpaceState } from "./platform.ts";
import { sqlIdent } from "./sql.ts";
import type { SqlConnection } from "./sql-gateway.ts";

/** Platform registry. Spaces, actors, and which space is active. */
export const CATALOG_DATABASE = "catalog";

/** Catalog tables. No `_` prefix — this file is already separate from record stores. */
export const CATALOG_TABLES = ["space", "actor", "kv"] as const;

const CATALOG_SQL = `
CREATE TABLE IF NOT EXISTS space (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT,
  spec TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actor (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  kind TEXT NOT NULL,
  roles TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const REQUIRED_COLUMNS: Record<(typeof CATALOG_TABLES)[number], string[]> = {
  space: ["id", "name", "created_by", "spec", "created_at", "updated_at"],
  actor: ["id", "space_id", "name", "email", "kind", "roles"],
  kv: ["key", "value"],
};

const LEGACY_TABLES = [
  "br_environment",
  "br_workspace",
  "br_app",
  "br_store",
  "br_shared_types",
  "br_space",
  "br_actor",
  "br_kv",
  "space",
  "actor",
  "kv",
];

export async function ensureCatalog(conn: SqlConnection): Promise<void> {
  await resetIncompatibleCatalog(conn);
  await conn.exec(CATALOG_SQL);
}

export async function listCatalogTables(conn: SqlConnection): Promise<string[]> {
  const rows = await conn.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((row) => String(row.name));
}

async function tableNames(conn: SqlConnection): Promise<Set<string>> {
  return new Set(await listCatalogTables(conn));
}

async function columnNames(conn: SqlConnection, table: string): Promise<Set<string>> {
  const rows = await conn.query(`PRAGMA table_info(${sqlIdent(table)})`);
  return new Set(rows.map((row) => String(row.name)));
}

async function resetIncompatibleCatalog(conn: SqlConnection): Promise<void> {
  const tables = await tableNames(conn);
  if (!tables.size) return;
  let compatible = ![...tables].some((table) => table.startsWith("br_"));
  if (compatible) {
    for (const table of CATALOG_TABLES) {
      if (!tables.has(table)) continue;
      const columns = await columnNames(conn, table);
      if (!REQUIRED_COLUMNS[table].every((column) => columns.has(column))) {
        compatible = false;
        break;
      }
    }
  }
  if (compatible) return;
  for (const table of new Set([...LEGACY_TABLES, ...tables])) {
    if (table.startsWith("sqlite_")) continue;
    await conn.exec(`DROP TABLE IF EXISTS ${sqlIdent(table)}`);
  }
}

export async function loadPlatform(conn: SqlConnection): Promise<PlatformState | null> {
  await ensureCatalog(conn);
  const rows = await conn.query(`SELECT * FROM space ORDER BY created_at`);
  if (!rows.length) return null;
  const actors = await conn.query(`SELECT * FROM actor`);
  const actorsBySpace = new Map<string, Actor[]>();
  for (const row of actors) {
    const spaceId = String(row.space_id);
    const list = actorsBySpace.get(spaceId) ?? [];
    list.push({
      id: String(row.id),
      name: String(row.name),
      email: String(row.email ?? "") || undefined,
      kind: row.kind as Actor["kind"],
      roles: JSON.parse(String(row.roles)),
    });
    actorsBySpace.set(spaceId, list);
  }
  const spaces: SpaceState[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    actors: actorsBySpace.get(String(row.id)) ?? [],
    spec: applyDefaults(normalizeSpec(JSON.parse(String(row.spec)) as AppSpec)),
  }));
  const active = await conn.query(`SELECT value FROM kv WHERE key = 'active_space_id'`);
  return {
    version: 1,
    activeSpaceId: String(
      active[0]?.value ?? spaces.find((item) => item.createdBy)?.id ?? spaces[0]?.id ?? "",
    ),
    spaces,
  };
}

export async function savePlatform(conn: SqlConnection, platform: PlatformState): Promise<void> {
  await ensureCatalog(conn);
  await conn.exec("BEGIN");
  try {
    const stamp = nowIso();
    const spaceIds = platform.spaces.map((space) => space.id);
    for (const space of platform.spaces) {
      await conn.exec(
        `INSERT INTO space (id, name, created_by, spec, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           created_by = excluded.created_by,
           spec = excluded.spec,
           updated_at = excluded.updated_at`,
        [space.id, space.name, space.createdBy ?? null, JSON.stringify(space.spec), stamp, stamp],
      );
      for (const actor of space.actors) {
        await conn.exec(
          `INSERT INTO actor (id, space_id, name, email, kind, roles) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             email = excluded.email,
             kind = excluded.kind,
             roles = excluded.roles`,
          [
            actor.id,
            space.id,
            actor.name,
            actor.email ?? "",
            actor.kind,
            JSON.stringify(actor.roles),
          ],
        );
      }
    }
    if (spaceIds.length) {
      await conn.exec(
        `DELETE FROM space WHERE id NOT IN (${spaceIds.map(() => "?").join(",")})`,
        spaceIds,
      );
      await conn.exec(
        `DELETE FROM actor WHERE space_id NOT IN (${spaceIds.map(() => "?").join(",")})`,
        spaceIds,
      );
      for (const space of platform.spaces) {
        const ids = space.actors.map((item) => item.id);
        if (!ids.length) {
          await conn.exec(`DELETE FROM actor WHERE space_id = ?`, [space.id]);
        } else {
          await conn.exec(
            `DELETE FROM actor WHERE space_id = ? AND id NOT IN (${ids.map(() => "?").join(",")})`,
            [space.id, ...ids],
          );
        }
      }
    }
    await conn.exec(
      `INSERT INTO kv (key, value) VALUES ('active_space_id', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [platform.activeSpaceId],
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
