import { createId } from "./ids.ts";
import type { ExecutionContext, FlowDef, FlowStep, RecordValue } from "./model.ts";
import { findType, type QueryContext } from "./query.ts";
import { executeView } from "./query.ts";
import { createRecord, deleteRecord, updateRecord, type ChangeEvent } from "./records.ts";
import { nowIso } from "./model.ts";

export interface FlowRun {
  id: string;
  flow: string;
  actorId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  changes: ChangeEvent[];
}

interface Scope {
  [key: string]: unknown;
}

export async function invokeFlow(
  ctx: QueryContext,
  flow: FlowDef,
  input: Record<string, unknown>,
  exec: ExecutionContext,
  options: {
    getFlow: (key: string) => FlowDef | undefined;
    depth?: number;
    guard?: Set<string>;
  },
): Promise<FlowRun> {
  if ((options.depth ?? 0) > 8) throw new Error("Flow composition is too deep");
  const scope: Scope = { ...input, now: nowIso() };
  await hydrateInputs(ctx, flow, scope);
  if (flow.when && !evaluateCondition(flow.when, scope)) {
    return {
      id: createId("run"),
      flow: flow.key,
      actorId: exec.actorId,
      input,
      output: scope,
      changes: [],
    };
  }
  const changes: ChangeEvent[] = [];
  await runSteps(ctx, flow.steps, scope, exec, changes, options);
  return {
    id: createId("run"),
    flow: flow.key,
    actorId: exec.actorId,
    input,
    output: scope,
    changes,
  };
}

async function hydrateInputs(ctx: QueryContext, flow: FlowDef, scope: Scope): Promise<void> {
  const entries = Object.entries(flow.input ?? {});
  for (const [name, value] of Object.entries(scope)) {
    if (value && typeof value === "object" && "id" in (value as object)) continue;
    const type = findType(ctx, name);
    if (!type || value == null || value === "") continue;
    const record = await ctx.engineFor(type.store).get(type.key, String(value));
    if (record) scope[name] = record;
  }
  for (const [name, expr] of entries) {
    const match = /^ref\((.+)\)$/.exec(expr.trim());
    if (!match) continue;
    const typeKey = match[1];
    const id = scope[name];
    if (!id || (typeof id === "object" && id && "id" in id)) continue;
    const type = findType(ctx, typeKey);
    if (!type) continue;
    const record = await ctx.engineFor(type.store).get(type.key, String(id));
    if (record) scope[name] = record;
  }
}

async function runSteps(
  ctx: QueryContext,
  steps: FlowStep[],
  scope: Scope,
  exec: ExecutionContext,
  changes: ChangeEvent[],
  options: {
    getFlow: (key: string) => FlowDef | undefined;
    depth?: number;
    guard?: Set<string>;
  },
): Promise<void> {
  for (const step of steps) {
    if ("create" in step) {
      const fields = resolveObject(step.create.fields, scope);
      const result = await createRecord(ctx, step.create.type, fields, exec);
      if (step.create.as) scope[step.create.as] = result.record;
      changes.push(result.change);
    } else if ("set" in step) {
      for (const [path, raw] of Object.entries(step.set)) {
        const value = resolveValue(raw, scope);
        const [refName, fieldKey] = path.split(".", 2);
        const record = scope[refName];
        if (!record || typeof record !== "object" || !fieldKey) {
          scope[path] = value;
          continue;
        }
        const current = record as RecordValue;
        const typeKey = inferTypeKey(ctx, current, refName);
        const result = await updateRecord(ctx, typeKey, current.id, { [fieldKey]: value }, exec);
        scope[refName] = result.record;
        changes.push(result.change);
      }
    } else if ("delete" in step) {
      const record = scope[step.delete.ref];
      if (record && typeof record === "object" && "id" in record) {
        const current = record as RecordValue;
        const typeKey = inferTypeKey(ctx, current, step.delete.ref);
        const result = await deleteRecord(ctx, typeKey, current.id);
        changes.push(result.change);
        delete scope[step.delete.ref];
      }
    } else if ("query" in step) {
      if (step.query.view) {
        const view = ctx.spec.views.find((item) => item.key === step.query.view);
        scope[step.query.as] = view ? await executeView(ctx, view) : [];
      } else if (step.query.type) {
        const type = findType(ctx, step.query.type);
        scope[step.query.as] = type
          ? await ctx.engineFor(type.store).select(type.key, { where: step.query.where })
          : [];
      }
    } else if ("when" in step) {
      if (evaluateCondition(step.when.condition, scope)) {
        await runSteps(ctx, step.when.then, scope, exec, changes, options);
      } else if (step.when.else) {
        await runSteps(ctx, step.when.else, scope, exec, changes, options);
      }
    } else if ("invoke" in step) {
      const nested = options.getFlow(step.invoke.flow);
      if (!nested) throw new Error(`Unknown flow ${step.invoke.flow}`);
      const nestedInput = resolveObject(step.invoke.input ?? {}, scope);
      const result = await invokeFlow(ctx, nested, nestedInput, exec, {
        ...options,
        depth: (options.depth ?? 0) + 1,
      });
      changes.push(...result.changes);
      scope[step.invoke.flow] = result.output;
    }
  }
}

function inferTypeKey(ctx: QueryContext, record: RecordValue, fallback: string): string {
  for (const type of [...ctx.sharedTypes, ...ctx.spec.types]) {
    if (type.key === fallback) return type.key;
  }
  return fallback;
}

export function evaluateCondition(
  condition: string | Record<string, unknown>,
  scope: Scope,
): boolean {
  if (typeof condition !== "string") {
    for (const [path, expected] of Object.entries(condition)) {
      if (String(lookupPath(scope, path) ?? "") !== String(resolveValue(expected, scope) ?? "")) {
        return false;
      }
    }
    return true;
  }
  const match = condition.match(/^\s*(.+?)\s*(==|!=)\s*(.+?)\s*$/);
  if (!match) return Boolean(lookupPath(scope, condition));
  const left = lookupPath(scope, match[1].trim());
  const right = resolveValue(match[3].trim(), scope);
  const equal = String(left ?? "") === String(right ?? "");
  return match[2] === "==" ? equal : !equal;
}

export function lookupPath(scope: Scope, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[part];
    return undefined;
  }, scope);
}

function resolveObject(input: Record<string, unknown>, scope: Scope): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, resolveValue(value, scope)]),
  );
}

function resolveValue(value: unknown, scope: Scope): unknown {
  if (typeof value !== "string") return value;
  if (value === "now") return nowIso();
  if (value.startsWith("$")) return lookupPath(scope, value.slice(1));
  const looked = lookupPath(scope, value);
  return looked === undefined ? coerceLiteral(value) : looked;
}

function coerceLiteral(value: string): unknown {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (!Number.isNaN(Number(value)) && value.trim() !== "") return Number(value);
  return value;
}

export function matchingTriggers(flows: FlowDef[], change: ChangeEvent): FlowDef[] {
  return flows.filter((flow) => {
    const when = flow.trigger?.when;
    if (!when) return false;
    if (when === `${change.type}.created`) return change.kind === "created";
    if (when === `${change.type}.deleted`) return change.kind === "deleted";
    if (when === `${change.type}.changed`)
      return change.kind === "updated" || change.kind === "created";
    const fieldChanged = /^(.+)\.(.+)\.changed$/.exec(when);
    if (fieldChanged) {
      return (
        fieldChanged[1] === change.type &&
        (change.kind === "updated" || change.kind === "created") &&
        change.changed.includes(fieldChanged[2])
      );
    }
    return false;
  });
}
