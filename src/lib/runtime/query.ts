import type { TableEngine } from "./engine.ts";
import { matchesWhere } from "./engine.ts";
import {
  parseTypeRef,
  type AppSpec,
  type FieldDef,
  type RecordValue,
  type TypeDef,
  type ViewDef,
} from "./model.ts";

export interface QueryContext {
  spec: AppSpec;
  sharedTypes: TypeDef[];
  engineFor: (type: TypeDef) => TableEngine;
}

export function allTypes(ctx: QueryContext): TypeDef[] {
  const keys = new Set(ctx.spec.types.map((type) => type.key));
  return [...ctx.sharedTypes.filter((type) => !keys.has(type.key)), ...ctx.spec.types];
}

export function findType(ctx: QueryContext, key: string): TypeDef | undefined {
  const parsed = parseTypeRef(key);
  return allTypes(ctx).find((type) => type.key === parsed.type);
}

export async function projectRow(
  ctx: QueryContext,
  type: TypeDef,
  row: RecordValue,
  fieldPaths: string[],
): Promise<Record<string, unknown>> {
  const projected: Record<string, unknown> = { id: row.id };
  const paths = fieldPaths.length ? fieldPaths : ["id", ...type.fields.map((field) => field.key)];
  for (const path of paths) {
    projected[path] = await resolvePath(ctx, type, row, path);
  }
  projected.created_at = row.created_at;
  projected.updated_at = row.updated_at;
  return projected;
}

export async function resolvePath(
  ctx: QueryContext,
  type: TypeDef,
  row: RecordValue,
  path: string,
): Promise<unknown> {
  const parts = path.split(".");
  let currentType: TypeDef | undefined = type;
  let current: unknown = row;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    const record = current as Record<string, unknown>;
    const field = currentType?.fields.find((item) => item.key === part);
    if (field?.type === "reference") {
      const target = findType(ctx, field.target || "");
      if (!target) return record[part] ?? null;
      const engine = ctx.engineFor(target);
      const related = await engine.get(target.key, String(record[part] ?? ""));
      current = related;
      currentType = target;
    } else {
      current = record[part];
      currentType = undefined;
    }
  }
  return current ?? null;
}

export async function executeView(
  ctx: QueryContext,
  view: ViewDef,
): Promise<Array<Record<string, unknown>>> {
  const type = findType(ctx, view.source);
  if (!type) return [];
  const engine = ctx.engineFor(type);
  const rows = await engine.select(type.key, {
    where: view.where,
    orderBy: view.order_by,
  });
  const projected = [];
  for (const row of rows) {
    projected.push(await projectRow(ctx, type, row, view.fields));
  }
  return projected;
}

export function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function filterRows(
  rows: Array<Record<string, unknown>>,
  where?: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (!where) return rows;
  return rows.filter((row) => matchesWhere(row, where));
}

export function fieldWidget(
  field: FieldDef,
): "text" | "number" | "date" | "checkbox" | "select" | "reference" {
  if (field.type === "boolean") return "checkbox";
  if (field.type === "enum") return "select";
  if (field.type === "reference") return "reference";
  if (field.type === "number") return "number";
  if (field.type === "date") return "date";
  return "text";
}
