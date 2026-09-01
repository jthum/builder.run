import type { TableEngine } from "./engine.ts";
import { sqlTypeFor, type AppSpec, type TypeDef } from "./model.ts";

export const META_TABLE = "_br_meta";

export interface IdentityRow {
  id: string;
  kind: "type" | "field";
  key: string;
  parent: string | null;
  table_name: string | null;
  column_name: string | null;
}

export async function ensureMeta(engine: TableEngine): Promise<void> {
  const tables = await engine.listTables();
  if (!tables.includes(META_TABLE)) {
    await engine.createTable(META_TABLE, [
      { name: "kind", sqlType: "TEXT" },
      { name: "key", sqlType: "TEXT" },
      { name: "parent", sqlType: "TEXT" },
      { name: "table_name", sqlType: "TEXT" },
      { name: "column_name", sqlType: "TEXT" },
    ]);
  }
}

export async function reconcileStore(engine: TableEngine, types: TypeDef[]): Promise<string[]> {
  await ensureMeta(engine);
  const changes: string[] = [];
  const identities = await loadIdentities(engine);
  const byId = new Map(identities.map((row) => [row.id, row]));
  const present = new Set(await engine.listTables());

  for (const type of types) {
    const previous = byId.get(type.id);
    const table = type.key;
    if (previous?.table_name && previous.table_name !== table && present.has(previous.table_name)) {
      await engine.renameTable(previous.table_name, table);
      changes.push(`rename table ${previous.table_name} -> ${table}`);
      present.delete(previous.table_name);
      present.add(table);
    }
    if (!present.has(table)) {
      await engine.createTable(
        table,
        type.fields.map((field) => ({ name: field.key, sqlType: sqlTypeFor(field) })),
      );
      changes.push(`create table ${table}`);
      present.add(table);
    } else {
      const columns = await engine.tableInfo(table);
      const columnNames = new Set(columns.map((column) => column.name));
      for (const field of type.fields) {
        const previousField = byId.get(field.id);
        if (
          previousField?.column_name &&
          previousField.column_name !== field.key &&
          columnNames.has(previousField.column_name)
        ) {
          await engine.renameColumn(table, previousField.column_name, field.key);
          changes.push(`rename ${table}.${previousField.column_name} -> ${field.key}`);
          columnNames.delete(previousField.column_name);
          columnNames.add(field.key);
        } else if (!columnNames.has(field.key)) {
          await engine.addColumn(table, { name: field.key, sqlType: sqlTypeFor(field) });
          changes.push(`add ${table}.${field.key}`);
          columnNames.add(field.key);
        }
      }
    }
    await upsertIdentity(engine, {
      id: type.id,
      kind: "type",
      key: type.key,
      parent: null,
      table_name: table,
      column_name: null,
    });
    for (const field of type.fields) {
      await upsertIdentity(engine, {
        id: field.id,
        kind: "field",
        key: field.key,
        parent: type.id,
        table_name: table,
        column_name: field.key,
      });
    }
  }

  const desiredTypeIds = new Set(types.map((type) => type.id));
  for (const identity of identities) {
    if (identity.kind === "type" && !desiredTypeIds.has(identity.id) && identity.table_name) {
      await engine.dropTable(identity.table_name);
      await engine.delete(META_TABLE, identity.id);
      changes.push(`drop table ${identity.table_name}`);
    }
  }
  const desiredFieldIds = new Set(types.flatMap((type) => type.fields.map((field) => field.id)));
  for (const identity of identities) {
    if (
      identity.kind === "field" &&
      !desiredFieldIds.has(identity.id) &&
      identity.table_name &&
      identity.column_name
    ) {
      try {
        await engine.dropColumn(identity.table_name, identity.column_name);
        changes.push(`drop ${identity.table_name}.${identity.column_name}`);
      } catch {
        // Some engines may not support DROP COLUMN; leave the physical column.
      }
      await engine.delete(META_TABLE, identity.id);
    }
  }
  return changes;
}

async function loadIdentities(engine: TableEngine): Promise<IdentityRow[]> {
  const rows = await engine.select(META_TABLE);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as IdentityRow["kind"],
    key: String(row.key ?? ""),
    parent: (row.parent as string | null) ?? null,
    table_name: (row.table_name as string | null) ?? null,
    column_name: (row.column_name as string | null) ?? null,
  }));
}

async function upsertIdentity(engine: TableEngine, row: IdentityRow): Promise<void> {
  const existing = await engine.get(META_TABLE, row.id);
  if (existing) {
    await engine.update(META_TABLE, row.id, { ...row });
  } else {
    await engine.insert(META_TABLE, { ...row, created_by: "system", updated_by: "system" });
  }
}

export function typesForStore(spec: AppSpec, storeKey: string): TypeDef[] {
  return spec.types.filter((type) => type.store === storeKey);
}
