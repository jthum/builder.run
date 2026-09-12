import { exposeFilters, matchFilters, normalizeFilters, type FilterClause } from "./filters.ts";
import { scalarString } from "./values.ts";
import {
  fieldWidgetFor,
  parseTypeRef,
  type AppSpec,
  type FieldDef,
  type FieldInputWidget,
  type RecordValue,
  type TypeDef,
  type ViewDef,
  type ViewMeasure,
} from "./model.ts";
import type { RecordStore } from "./storage.ts";

function mergeExpose(base: FilterClause[], extra: FilterClause[]): FilterClause[] {
  const next = [...base];
  for (const clause of extra) {
    const index = next.findIndex((item) => item.field === clause.field);
    if (index >= 0) next[index] = clause;
    else next.push(clause);
  }
  return next;
}

export interface QueryContext {
  spec: AppSpec;
  sharedTypes: TypeDef[];
  recordsFor: (type: TypeDef) => RecordStore;
  queries: QueryExecutor;
}

/** Executes portable views; runtimes may replace this when they can do more natively. */
export interface QueryExecutor {
  execute(
    context: QueryContext,
    view: ViewDef,
    expose?: Record<string, unknown>,
    run?: ViewRunContext,
  ): Promise<Array<Record<string, unknown>>>;
}

export class PortableQueryExecutor implements QueryExecutor {
  execute(
    context: QueryContext,
    view: ViewDef,
    expose?: Record<string, unknown>,
    run?: ViewRunContext,
  ): Promise<Array<Record<string, unknown>>> {
    return executePortableView(context, view, expose, run);
  }
}

export interface QuerySession {
  related: Map<string, Promise<RecordValue | null>>;
}

function createQuerySession(): QuerySession {
  return { related: new Map() };
}

function relatedRecord(
  ctx: QueryContext,
  target: TypeDef,
  id: string,
  session: QuerySession,
): Promise<RecordValue | null> {
  const cacheKey = `${target.id}:${id}`;
  let lookup = session.related.get(cacheKey);
  if (!lookup) {
    lookup = ctx.recordsFor(target).get(target, id);
    session.related.set(cacheKey, lookup);
  }
  return lookup;
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
  session: QuerySession = createQuerySession(),
): Promise<Record<string, unknown>> {
  const projected: Record<string, unknown> = { id: row.id };
  const paths = fieldPaths.length ? fieldPaths : ["id", ...type.fields.map((field) => field.key)];
  for (const path of paths) {
    projected[path] = await resolvePath(ctx, type, row, path, session);
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
  session: QuerySession = createQuerySession(),
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
      const id = scalarString(record[part]);
      const related = await relatedRecord(ctx, target, id, session);
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
  return ctx.queries.execute(ctx, view, expose, context);
}

async function executePortableView(
  ctx: QueryContext,
  view: ViewDef,
  expose?: Record<string, unknown>,
  context?: ViewRunContext,
): Promise<Array<Record<string, unknown>>> {
  const session = createQuerySession();
  const type = findType(ctx, view.source);
  if (!type) return [];
  const records = ctx.recordsFor(type);
  const clauses = mergeExpose(normalizeFilters(view.where), exposeFilters(view.expose, expose)).map(
    (clause) => resolveClause(clause, context),
  );
  const directClauses = clauses.filter((clause) => !clause.field.includes("."));
  const relatedClauses = clauses.filter((clause) => clause.field.includes("."));
  if (view.group_by) {
    const sourceRows = await records.query(type, { filters: directClauses });
    const filtered = [];
    for (const row of sourceRows) {
      if (relatedClauses.length) {
        const projected = await projectRow(
          ctx,
          type,
          row,
          relatedClauses.map((clause) => clause.field),
          session,
        );
        if (!matchFilters(projected, relatedClauses)) continue;
      }
      filtered.push(row);
    }
    const grouped = await aggregateRows(ctx, type, filtered, view, session);
    return grouped.slice(0, view.limit ?? grouped.length);
  }
  const order = Object.entries(view.order_by ?? {});
  const hasRelatedOrder = order.some(([field]) => field.includes("."));
  const needsPortablePass = relatedClauses.length > 0 || hasRelatedOrder;
  const rows = await records.query(type, {
    filters: directClauses,
    order: hasRelatedOrder
      ? undefined
      : Object.entries(view.order_by ?? {}).map(([field, direction]) => ({ field, direction })),
    limit: needsPortablePass ? undefined : view.limit,
  });
  const evaluationPaths = [
    ...view.fields,
    ...relatedClauses.map((clause) => clause.field),
    ...(hasRelatedOrder ? order.map(([field]) => field) : []),
  ];
  const projected: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const next = await projectRow(ctx, type, row, [...new Set(evaluationPaths)], session);
    if (relatedClauses.length && !matchFilters(next, relatedClauses)) continue;
    projected.push(next);
  }
  if (hasRelatedOrder) sortRows(projected, order);
  return projected
    .slice(0, view.limit ?? projected.length)
    .map((row) => selectViewFields(row, view.fields));
}

function sortRows(
  rows: Array<Record<string, unknown>>,
  order: Array<[string, "asc" | "desc"]>,
): void {
  rows.sort((left, right) => {
    for (const [field, direction] of order) {
      const compared = compareValues(left[field], right[field]);
      if (compared) return direction === "desc" ? -compared : compared;
    }
    return 0;
  });
}

function selectViewFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return {
    id: row.id,
    ...Object.fromEntries(fields.map((field) => [field, row[field]])),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function aggregateRows(
  ctx: QueryContext,
  type: TypeDef,
  rows: RecordValue[],
  view: ViewDef,
  session: QuerySession,
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
        [groupBy]: await groupLabel(ctx, type, groupBy, group.value, session),
      };
      for (const [alias, measure] of Object.entries(view.measures ?? {})) {
        output[alias] = aggregateMeasure(group.rows, measure);
      }
      return output;
    }),
  );
  const order = Object.entries(view.order_by ?? {});
  if (order.length) sortRows(result, order);
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
  session: QuerySession,
): Promise<unknown> {
  const field = type.fields.find((item) => item.key === fieldKey);
  if (field?.type !== "reference" || !field.target || value == null || value === "") return value;
  const target = findType(ctx, field.target);
  if (!target) return value;
  const id = scalarString(value);
  const related = await relatedRecord(ctx, target, id, session);
  if (!related) return value;
  const title = ["name", "title", "number", "email"].find((key) =>
    target.fields.some((item) => item.key === key),
  );
  return title ? (related[title] ?? value) : value;
}

export function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return scalarString(value);
}

export function filterRows(
  rows: Array<Record<string, unknown>>,
  where?: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (!where) return rows;
  const clauses = normalizeFilters(where);
  return rows.filter((row) => matchFilters(row, clauses));
}

export function fieldWidget(field: FieldDef): FieldInputWidget {
  return fieldWidgetFor(field.type, field.presentation);
}
