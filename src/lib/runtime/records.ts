import { coerceFieldValue, type TableEngine } from "./engine.ts";
import { createId } from "./ids.ts";
import {
  nowIso,
  type ExecutionContext,
  type FieldDef,
  type RecordValue,
  type TypeDef,
} from "./model.ts";
import { findType, type QueryContext } from "./query.ts";
import { scalarEqual, scalarString } from "./values.ts";

export interface ChangeEvent {
  kind: "created" | "updated" | "deleted";
  type: string;
  id: string;
  before?: RecordValue | null;
  after?: RecordValue | null;
  changed: string[];
  transition?: {
    key: string;
    field: string;
    from: string;
    to: string;
  };
}

export function validateRecord(
  type: TypeDef,
  values: Record<string, unknown>,
  partial = false,
): string[] {
  const errors: string[] = [];
  for (const field of type.fields) {
    const value = values[field.key];
    const missing = value == null || value === "";
    if (!partial && field.required && missing) {
      errors.push(`${field.label} is required`);
    }
    if (
      !missing &&
      field.type === "enum" &&
      field.values &&
      !field.values.includes(scalarString(value))
    ) {
      errors.push(`${field.label} must be one of: ${field.values.join(", ")}`);
    }
    if (!missing && field.type === "number" && Number.isNaN(Number(value))) {
      errors.push(`${field.label} must be a number`);
    }
    if (
      !missing &&
      field.type === "number" &&
      field.presentation === "rating" &&
      !Number.isNaN(Number(value))
    ) {
      const numeric = Number(value);
      const max = field.max ?? 10;
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) {
        errors.push(`${field.label} must be a whole number from 1 to ${max}`);
      }
    }
  }
  return errors;
}

export function prepareValues(
  type: TypeDef,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const prepared: Record<string, unknown> = {};
  for (const field of type.fields) {
    if (
      field.key === type.lifecycle?.field &&
      (values[field.key] == null || values[field.key] === "")
    ) {
      prepared[field.key] = type.lifecycle.initial;
    } else if (field.key in values) {
      prepared[field.key] = coerceFieldValue(field.type, values[field.key]);
    } else if (field.default !== undefined) {
      prepared[field.key] = coerceFieldValue(field.type, field.default);
    }
  }
  return prepared;
}

export async function createRecord(
  ctx: QueryContext,
  typeKey: string,
  values: Record<string, unknown>,
  exec: ExecutionContext,
): Promise<{ record: RecordValue; change: ChangeEvent }> {
  const type = requireType(ctx, typeKey);
  const lifecycleValue = type.lifecycle ? values[type.lifecycle.field] : undefined;
  if (
    type.lifecycle &&
    lifecycleValue != null &&
    lifecycleValue !== "" &&
    scalarString(lifecycleValue) !== type.lifecycle.initial
  ) {
    throw new Error(`${type.label} must start in lifecycle state ${type.lifecycle.initial}`);
  }
  const prepared = prepareValues(type, values);
  const errors = validateRecord(type, prepared);
  if (errors.length) throw new Error(errors.join("; "));
  const engine = ctx.engineFor(type);
  const stamp = nowIso();
  const record: RecordValue = {
    id: createId("rec"),
    created_at: stamp,
    updated_at: stamp,
    created_by: exec.actorId,
    updated_by: exec.actorId,
    ...prepared,
  };
  await engine.insert(type.key, record);
  const stored = decodeRecord(type, (await engine.get(type.key, record.id)) ?? record);
  return {
    record: stored,
    change: {
      kind: "created",
      type: type.key,
      id: stored.id,
      after: stored,
      changed: type.fields.map((field) => field.key),
    },
  };
}

export async function updateRecord(
  ctx: QueryContext,
  typeKey: string,
  id: string,
  values: Record<string, unknown>,
  exec: ExecutionContext,
): Promise<{ record: RecordValue; change: ChangeEvent }> {
  const type = requireType(ctx, typeKey);
  const engine = ctx.engineFor(type);
  const before = await engine.get(type.key, id);
  if (!before) throw new Error(`${type.label} ${id} not found`);
  const prepared = prepareValues(type, { ...before, ...values });
  const errors = validateRecord(type, prepared, true);
  if (errors.length) throw new Error(errors.join("; "));
  const changed = changedFields(type.fields, before, prepared);
  const transition = resolveLifecycleTransition(type, before, prepared);
  await engine.update(type.key, id, {
    ...prepared,
    updated_by: exec.actorId,
    updated_at: nowIso(),
  });
  const record = decodeRecord(type, (await engine.get(type.key, id)) as RecordValue);
  return {
    record,
    change: {
      kind: "updated",
      type: type.key,
      id,
      before: decodeRecord(type, before),
      after: record,
      changed,
      ...(transition ? { transition } : {}),
    },
  };
}

function resolveLifecycleTransition(
  type: TypeDef,
  before: RecordValue,
  next: Record<string, unknown>,
): ChangeEvent["transition"] {
  const lifecycle = type.lifecycle;
  if (!lifecycle || scalarEqual(before[lifecycle.field], next[lifecycle.field])) return undefined;
  const from = scalarString(before[lifecycle.field]);
  const to = scalarString(next[lifecycle.field]);
  const transition = lifecycle.transitions.find(
    (item) => item.from.includes(from) && item.to === to,
  );
  if (!transition) {
    throw new Error(`Invalid ${type.label} lifecycle transition from ${from} to ${to}`);
  }
  return { key: transition.key, field: lifecycle.field, from, to };
}

export async function deleteRecord(
  ctx: QueryContext,
  typeKey: string,
  id: string,
): Promise<{ change: ChangeEvent }> {
  const type = requireType(ctx, typeKey);
  const engine = ctx.engineFor(type);
  const before = await engine.get(type.key, id);
  if (!before) throw new Error(`${type.label} ${id} not found`);
  await engine.delete(type.key, id);
  return {
    change: {
      kind: "deleted",
      type: type.key,
      id,
      before,
      changed: type.fields.map((field) => field.key),
    },
  };
}

function changedFields(
  fields: FieldDef[],
  before: RecordValue,
  next: Record<string, unknown>,
): string[] {
  return fields
    .filter((field) => !scalarEqual(before[field.key], next[field.key]))
    .map((field) => field.key);
}

export function decodeRecord(type: TypeDef, row: RecordValue): RecordValue {
  const decoded: RecordValue = { ...row };
  for (const field of type.fields) {
    if (field.key in decoded) {
      decoded[field.key] = coerceFieldValue(field.type, decoded[field.key]) as never;
    }
  }
  return decoded;
}

function requireType(ctx: QueryContext, typeKey: string): TypeDef {
  const type = findType(ctx, typeKey);
  if (!type) throw new Error(`Unknown type ${typeKey}`);
  return type;
}

export function engineLookup(engines: Map<string, TableEngine>): (storeKey: string) => TableEngine {
  return (storeKey: string) => {
    const engine = engines.get(storeKey);
    if (!engine) throw new Error(`Unknown store ${storeKey}`);
    return engine;
  };
}
