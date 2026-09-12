import type { Actor, AppSpec } from "../../model.ts";
import { nowIso, normalizeSpec } from "../../model.ts";
import {
  SPACE_ACCENT_KEYS,
  type PlatformState,
  type SpaceAccent,
  type SpaceState,
} from "../../platform.ts";
import type { CatalogRepository } from "../../storage.ts";
import { scalarString } from "../../values.ts";
import type { SqlConnection } from "./gateway.ts";

/** Platform registry. Spaces, actors, and which space is active. */
export const CATALOG_DATABASE = "catalog";

/** Catalog tables. No `_` prefix — this file is already separate from record stores. */
export const CATALOG_TABLES = ["space", "actor", "kv"] as const;
const SPACE_APPEARANCE_PREFIX = "space_appearance:";

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

export async function ensureCatalog(conn: SqlConnection): Promise<void> {
  await conn.exec(CATALOG_SQL);
}

export async function listCatalogTables(conn: SqlConnection): Promise<string[]> {
  const rows = await conn.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((row) => String(row.name));
}

export async function loadPlatform(conn: SqlConnection): Promise<PlatformState | null> {
  await ensureCatalog(conn);
  const rows = await conn.query(`SELECT * FROM space ORDER BY created_at`);
  if (!rows.length) return null;
  const actors = await conn.query(`SELECT * FROM actor`);
  const appearanceRows = await conn.query(
    `SELECT key, value FROM kv WHERE key LIKE '${SPACE_APPEARANCE_PREFIX}%'`,
  );
  const appearanceBySpace = new Map<string, { accent: SpaceAccent }>();
  for (const row of appearanceRows) {
    const id = scalarString(row.key).slice(SPACE_APPEARANCE_PREFIX.length);
    try {
      const value = JSON.parse(scalarString(row.value)) as { accent?: unknown };
      if (SPACE_ACCENT_KEYS.includes(value.accent as SpaceAccent)) {
        appearanceBySpace.set(id, { accent: value.accent as SpaceAccent });
      }
    } catch {
      // Ignore malformed runtime preferences and retain the default appearance.
    }
  }
  const actorsBySpace = new Map<string, Actor[]>();
  for (const row of actors) {
    const spaceId = String(row.space_id);
    const list = actorsBySpace.get(spaceId) ?? [];
    list.push({
      id: String(row.id),
      name: String(row.name),
      email: scalarString(row.email) || undefined,
      kind: row.kind as Actor["kind"],
      roles: JSON.parse(String(row.roles)),
    });
    actorsBySpace.set(spaceId, list);
  }
  const spaces: SpaceState[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    createdBy: row.created_by ? scalarString(row.created_by) : undefined,
    actors: actorsBySpace.get(String(row.id)) ?? [],
    appearance: appearanceBySpace.get(String(row.id)),
    spec: normalizeSpec(JSON.parse(String(row.spec)) as AppSpec),
  }));
  const active = await conn.query(`SELECT value FROM kv WHERE key = 'active_space_id'`);
  return {
    version: 1,
    activeSpaceId: scalarString(
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
      const appearanceKey = `${SPACE_APPEARANCE_PREFIX}${space.id}`;
      if (space.appearance) {
        await conn.exec(
          `INSERT INTO kv (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [appearanceKey, JSON.stringify(space.appearance)],
        );
      } else {
        await conn.exec(`DELETE FROM kv WHERE key = ?`, [appearanceKey]);
      }
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
      const appearanceKeys = spaceIds.map((id) => `${SPACE_APPEARANCE_PREFIX}${id}`);
      await conn.exec(
        `DELETE FROM kv WHERE key LIKE '${SPACE_APPEARANCE_PREFIX}%'
         AND key NOT IN (${appearanceKeys.map(() => "?").join(",")})`,
        appearanceKeys,
      );
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

/** Keeps the browser Host independent of the SQLite catalogue representation. */
export class SqliteCatalogRepository implements CatalogRepository {
  readonly name = CATALOG_DATABASE;

  constructor(private readonly connection: SqlConnection) {}

  async load(): Promise<PlatformState | null> {
    await ensureCatalog(this.connection);
    return loadPlatform(this.connection);
  }

  save(platform: PlatformState): Promise<void> {
    return savePlatform(this.connection, platform);
  }

  collections(): Promise<string[]> {
    return listCatalogTables(this.connection);
  }

  close(): Promise<void> {
    return this.connection.close();
  }
}
