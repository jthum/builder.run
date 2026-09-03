import type { TableEngine } from "./engine.ts";
import { matchesWhere } from "./engine.ts";
import { exposeFilters, matchFilters, normalizeFilters, type FilterClause } from "./filters.ts";

function mergeExpose(base: FilterClause[], extra: FilterClause[]): FilterClause[] {
  const next = [...base];
  for (const clause of extra) {
    const index = next.findIndex((item) => item.field === clause.field);
    if (index >= 0) next[index] = clause;
    else next.push(clause);
  }
  return next;
}
import {
  parseTypeRef,
  type AppSpec,
  type FieldDef,
  type RecordValue,
  type TypeDef,
  type ViewDef,
  type ViewMeasure,
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

export const RECORD_ID_TOKEN = "$record.id";

export interface ViewRunContext {
  recordId?: string;
}

export function viewUsesRecord(view: ViewDef): boolean {
  return normalizeFilters(view.where).some((clause) => clause.value === RECORD_ID_TOKEN);
}

function resolveClause(clause: FilterClause, context?: ViewRunContext): FilterClause {
  if (clause.value !== RECORD_ID_TOKEN) return clause;
  return { ...clause, value: context?.recordId ?? clause.value };
}

export async function executeView(
  ctx: QueryContext,
  view: ViewDef,
  expose?: Record<string, unknown>,
  context?: ViewRunContext,
): Promise<Array<Record<string, unknown>>> {
  const type = findType(ctx, view.source);
  if (!type) return [];
  const engine = ctx.engineFor(type);
  const clauses = mergeExpose(normalizeFilters(view.where), exposeFilters(view.expose, expose)).map(
    (clause) => resolveClause(clause, context),
  );
  const sqlClauses = clauses.filter((clause) => !clause.field.includes("."));
  const memClauses = clauses.filter((clause) => clause.field.includes("."));
  if (view.group_by) {
    const sourceRows = await engine.select(type.key, { where: sqlClauses });
    const filtered = [];
    for (const row of sourceRows) {
      if (memClauses.length) {
        const projected = await projectRow(
          ctx,
          type,
          row,
          memClauses.map((clause) => clause.field),
        );
        if (!matchFilters(projected, memClauses)) continue;
      }
      filtered.push(row);
    }
    const grouped = await aggregateRows(ctx, type, filtered, view);
    return grouped.slice(0, view.limit ?? grouped.length);
  }
  const rows = await engine.select(type.key, {
    where: sqlClauses,
    orderBy: view.order_by,
    limit: view.limit,
  });
  const projected = [];
  for (const row of rows) {
    const next = await projectRow(ctx, type, row, view.fields);
    if (memClauses.length && !matchFilters(next, memClauses)) continue;
    projected.push(next);
  }
  return projected;
}

async function aggregateRows(
  ctx: QueryContext,
  type: TypeDef,
  rows: RecordValue[],
  view: ViewDef,
): Promise<Array<Record<string, unknown>>> {
  const groupBy = view.group_by as string;
  const groups = new Map<string, { value: unknown; rows: RecordValue[] }>();
  for (const row of rows) {
    const value = row[groupBy];
    const token = `${typeof value}:${JSON.stringify(value)}`;
    const group = groups.get(token);
    if (group) group.rows.push(row);
    else groups.set(token, { value, rows: [row] });
  }
  const result = await Promise.all(
    [...groups.values()].map(async (group) => {
      const output: Record<string, unknown> = {
        id: scalarString(group.value),
        [groupBy]: await groupLabel(ctx, type, groupBy, group.value),
      };
      for (const [alias, measure] of Object.entries(view.measures ?? {})) {
        output[alias] = aggregateMeasure(group.rows, measure);
      }
      return output;
    }),
  );
  const order = Object.entries(view.order_by ?? {});
  if (order.length) {
    result.sort((left, right) => {
      for (const [field, direction] of order) {
        const compared = compareValues(left[field], right[field]);
        if (compared) return direction === "desc" ? -compared : compared;
      }
      return 0;
    });
  }
  return result;
}

function aggregateMeasure(rows: RecordValue[], measure: ViewMeasure): number | null {
  if (measure.op === "count") return rows.length;
  const values = rows
    .map((row) => measureValue(row, measure))
    .filter((value): value is number => value != null);
  if (!values.length) return null;
  if (measure.op === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (measure.op === "min") return Math.min(...values);
  if (measure.op === "max") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function measureValue(row: RecordValue, measure: ViewMeasure): number | null {
  if (measure.op === "avg" && measure.fields?.length) {
    const values = measure.fields.map((field) => finiteNumber(row[field]));
    if (values.some((value) => value == null)) return null;
    return (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
  }
  return finiteNumber(measure.field ? row[measure.field] : null);
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null || left === "") return right == null || right === "" ? 0 : 1;
  if (right == null || right === "") return -1;
  const leftNumber = finiteNumber(left);
  const rightNumber = finiteNumber(right);
  if (leftNumber != null && rightNumber != null) return leftNumber - rightNumber;
  return scalarString(left).localeCompare(scalarString(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function groupLabel(
  ctx: QueryContext,
  type: TypeDef,
  fieldKey: string,
  value: unknown,
): Promise<unknown> {
  const field = type.fields.find((item) => item.key === fieldKey);
  if (field?.type !== "reference" || !field.target || value == null || value === "") return value;
  const target = findType(ctx, field.target);
  if (!target) return value;
  const related = await ctx.engineFor(target).get(target.key, scalarString(value));
  if (!related) return value;
  const title = ["name", "title", "number", "email"].find((key) =>
    target.fields.some((item) => item.key === key),
  );
  return title ? (related[title] ?? value) : value;
}

function scalarString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
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
): "text" | "number" | "date" | "checkbox" | "select" | "reference" | "rating" {
  if (field.type === "number" && field.presentation === "rating") return "rating";
  if (field.type === "boolean") return "checkbox";
  if (field.type === "enum") return "select";
  if (field.type === "reference") return "reference";
  if (field.type === "number") return "number";
  if (field.type === "date") return "date";
  return "text";
}
