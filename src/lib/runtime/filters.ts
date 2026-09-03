import type { FilterClause, FilterOp } from "./model.ts";
import { scalarString } from "./values.ts";

export type { FilterClause, FilterOp };

export const FILTER_OPS: Array<{ value: FilterOp; label: string }> = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "in", label: "is one of" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
];

export function normalizeFilters(
  where?: FilterClause[] | Record<string, unknown> | null,
): FilterClause[] {
  if (!where) return [];
  if (Array.isArray(where)) {
    return where.filter((clause) => clause?.field);
  }
  return Object.entries(where).map(([field, value]) => ({ field, op: "eq" as const, value }));
}

export function compactWhere(
  clauses: FilterClause[],
): FilterClause[] | Record<string, unknown> | undefined {
  const usable = clauses.filter((clause) => clause.field);
  if (!usable.length) return undefined;
  const simple = usable.every(
    (clause) =>
      (!clause.op || clause.op === "eq") &&
      clause.value != null &&
      clause.value !== "" &&
      !Array.isArray(clause.value),
  );
  if (simple) {
    return Object.fromEntries(usable.map((clause) => [clause.field, clause.value]));
  }
  return usable;
}

export function inValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== "");
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value == null || value === "" ? [] : [value];
}

function cell(row: Record<string, unknown>, field: string): unknown {
  if (!field.includes(".")) return row[field];
  return field.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, row);
}

export function matchFilter(row: Record<string, unknown>, clause: FilterClause): boolean {
  const left = cell(row, clause.field);
  const op = clause.op ?? "eq";
  switch (op) {
    case "empty":
      return left == null || left === "";
    case "not_empty":
      return left != null && left !== "";
    case "contains":
      return scalarString(left).toLowerCase().includes(scalarString(clause.value).toLowerCase());
    case "in":
      return inValues(clause.value).some((item) => scalarString(item) === scalarString(left));
    case "neq":
      return scalarString(left) !== scalarString(clause.value);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = Number(left);
      const b = Number(clause.value);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        if (op === "gt") return a > b;
        if (op === "gte") return a >= b;
        if (op === "lt") return a < b;
        return a <= b;
      }
      const as = scalarString(left);
      const bs = scalarString(clause.value);
      if (op === "gt") return as > bs;
      if (op === "gte") return as >= bs;
      if (op === "lt") return as < bs;
      return as <= bs;
    }
    default:
      return scalarString(left) === scalarString(clause.value);
  }
}

export function matchFilters(row: Record<string, unknown>, clauses: FilterClause[]): boolean {
  return clauses.every((clause) => matchFilter(row, clause));
}

export function exposeFilters(
  fields: string[] | undefined,
  values?: Record<string, unknown>,
): FilterClause[] {
  if (!fields?.length || !values) return [];
  const extra: FilterClause[] = [];
  for (const field of fields) {
    const value = values[field];
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    extra.push({
      field,
      op: Array.isArray(value) ? "in" : "eq",
      value,
    });
  }
  return extra;
}
