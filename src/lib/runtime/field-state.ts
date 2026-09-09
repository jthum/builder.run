import type { FieldCondition, FieldDef, FilterClause } from "./model.ts";
import { scalarEqual, scalarString } from "./values.ts";

export interface ResolvedFieldState {
  visible: boolean;
  enabled: boolean;
  required: boolean;
}

export function resolveFieldState(
  field: FieldDef,
  values: Record<string, unknown>,
): ResolvedFieldState {
  const visible = field.visible_when ? evaluateFieldCondition(field.visible_when, values) : true;
  return {
    visible,
    enabled:
      visible && (field.enabled_when ? evaluateFieldCondition(field.enabled_when, values) : true),
    required:
      visible &&
      (Boolean(field.required) ||
        Boolean(field.required_when && evaluateFieldCondition(field.required_when, values))),
  };
}

export function evaluateFieldCondition(
  condition: FieldCondition,
  values: Record<string, unknown>,
): boolean {
  if ("all" in condition) {
    return condition.all.every((item) => evaluateFieldCondition(item, values));
  }
  if ("any" in condition) {
    return condition.any.some((item) => evaluateFieldCondition(item, values));
  }
  if ("not" in condition) return !evaluateFieldCondition(condition.not, values);
  return evaluateClause(condition, values);
}

function evaluateClause(clause: FilterClause, values: Record<string, unknown>): boolean {
  const actual = values[clause.field];
  const expected = clause.value;
  const op = clause.op ?? "eq";
  const empty = actual == null || (typeof actual === "string" && actual.trim() === "");
  if (op === "empty") return empty;
  if (op === "not_empty") return !empty;
  if (op === "eq") return scalarEqual(actual, expected);
  if (op === "neq") return !scalarEqual(actual, expected);
  if (op === "contains") {
    return Array.isArray(actual)
      ? actual.some((item) => scalarEqual(item, expected))
      : scalarString(actual).includes(scalarString(expected));
  }
  if (op === "in") {
    return Array.isArray(expected) && expected.some((item) => scalarEqual(actual, item));
  }
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (op === "gt") return left > right;
  if (op === "gte") return left >= right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  return false;
}

export function conditionFieldKeys(condition: FieldCondition): string[] {
  if ("all" in condition) return condition.all.flatMap(conditionFieldKeys);
  if ("any" in condition) return condition.any.flatMap(conditionFieldKeys);
  if ("not" in condition) return conditionFieldKeys(condition.not);
  return [condition.field];
}

export function renameConditionField(
  condition: FieldCondition,
  from: string,
  to: string,
): FieldCondition {
  if ("all" in condition) {
    return { all: condition.all.map((item) => renameConditionField(item, from, to)) };
  }
  if ("any" in condition) {
    return { any: condition.any.map((item) => renameConditionField(item, from, to)) };
  }
  if ("not" in condition) return { not: renameConditionField(condition.not, from, to) };
  return condition.field === from ? { ...condition, field: to } : condition;
}
