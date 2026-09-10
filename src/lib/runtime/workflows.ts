import { createId } from "./ids.ts";
import {
  BROWSER_LOCAL_AUTOMATION_PROFILE,
  checkAutomationCompatibility,
} from "./automation/capabilities.ts";
import type {
  AutomationCondition,
  AutomationEffectCall,
  AutomationPredicate,
} from "./automation/model.ts";
import { validateAutomation } from "./automation/validate.ts";
import type { ExecutionContext, WorkflowDef, WorkflowStep, RecordValue } from "./model.ts";
import { nowIso } from "./model.ts";
import { executeView, findType, type QueryContext } from "./query.ts";
import { createRecord, deleteRecord, updateRecord, type ChangeEvent } from "./records.ts";
import { scalarString } from "./values.ts";

export interface WorkflowRun {
  id: string;
  workflow: string;
  actorId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  changes: ChangeEvent[];
}

type Scope = Record<string, unknown>;
interface RunState {
  changes: ChangeEvent[];
  compensations: AutomationEffectCall[];
}
interface RunOptions {
  getWorkflow: (key: string) => WorkflowDef | undefined;
  depth?: number;
  guard?: Set<string>;
  budget?: { remaining: number };
  collectCompensations?: (calls: AutomationEffectCall[]) => void;
}

const DEFAULT_STEP_BUDGET = 2_000;

export async function invokeWorkflow(
  ctx: QueryContext,
  workflow: WorkflowDef,
  input: Record<string, unknown>,
  exec: ExecutionContext,
  options: RunOptions,
): Promise<WorkflowRun> {
  if ((options.depth ?? 0) > 8) throw new Error("Workflow composition is too deep");
  if (workflow.enabled === false) throw new Error(`Workflow ${workflow.key} is disabled`);
  assertExecutable(workflow);
  options.budget ??= { remaining: DEFAULT_STEP_BUDGET };
  const variables: Scope = { ...input };
  const scope: Scope = {
    vars: variables,
    meta: { now: nowIso(), record_types: {} },
    actor: { id: exec.actorId },
    trigger: { key: workflow.trigger?.key ?? null, payload: { ...input } },
  };
  await hydrateInputs(ctx, workflow, variables);
  for (const [name, definition] of Object.entries(workflow.input ?? {})) {
    if ("record" in definition) recordTypes(scope)[name] = definition.record;
  }
  const state: RunState = { changes: [], compensations: [] };
  try {
    await runSteps(ctx, workflow.steps, scope, exec, state, options);
  } catch (error) {
    await compensate(ctx, state, scope, exec);
    throw error;
  }
  options.collectCompensations?.(state.compensations);
  return {
    id: createId("run"),
    workflow: workflow.key,
    actorId: exec.actorId,
    input,
    output: variables,
    changes: state.changes,
  };
}

function assertExecutable(workflow: WorkflowDef): void {
  const language = validateAutomation(workflow);
  const blockers = language.diagnostics.filter(
    (item) => item.severity === "error" || item.code.endsWith(".unresolved"),
  );
  if (blockers.length) throw new Error(blockers.map((item) => item.message).join("; "));
  const compatibility = checkAutomationCompatibility(workflow, BROWSER_LOCAL_AUTOMATION_PROFILE);
  const unsupported = compatibility.diagnostics.filter((item) => item.support === "unsupported");
  if (unsupported.length) throw new Error(unsupported.map((item) => item.message).join("; "));
}

async function hydrateInputs(
  ctx: QueryContext,
  workflow: WorkflowDef,
  scope: Scope,
): Promise<void> {
  for (const [name, definition] of Object.entries(workflow.input ?? {})) {
    if (scope[name] === undefined && "default" in definition) scope[name] = definition.default;
    const value = scope[name];
    if (value == null || value === "") {
      if (definition.required !== false) throw new Error(`Workflow input ${name} is required`);
      continue;
    }
    if (!("record" in definition) || (typeof value === "object" && "id" in (value as object))) {
      if ("value" in definition && !matchesInputType(value, definition.value)) {
        throw new Error(`Workflow input ${name} must be ${definition.value}`);
      }
      continue;
    }
    const type = findType(ctx, definition.record);
    if (!type) throw new Error(`Unknown input record type ${definition.record}`);
    const record = await ctx.engineFor(type).get(type.key, scalarString(value));
    if (!record) throw new Error(`Unknown ${definition.record} record ${scalarString(value)}`);
    scope[name] = record;
  }
}

async function runSteps(
  ctx: QueryContext,
  steps: WorkflowStep[],
  scope: Scope,
  exec: ExecutionContext,
  state: RunState,
  options: RunOptions,
): Promise<void> {
  for (const step of steps) {
    consumeBudget(options);
    if ("gate" in step) {
      const branch = evaluateCondition(step.gate.predicate, scope)
        ? step.gate.pass
        : step.gate.fail;
      if (branch) await runSteps(ctx, branch, scope, exec, state, options);
    } else if ("compute" in step) {
      const assignments = resolveObject(step.compute.assign, scope);
      for (const [name, value] of Object.entries(step.compute.assign)) {
        const sourceName = directVariableBinding(value);
        const sourceType = sourceName ? recordTypes(scope)[sourceName] : undefined;
        if (sourceType) recordTypes(scope)[name] = sourceType;
        else delete recordTypes(scope)[name];
      }
      Object.assign(variables(scope), assignments);
    } else if ("effect" in step) {
      const effect = step.effect;
      const output = await withRetry(
        effect.retry,
        () => executeEffect(ctx, effect, scope, exec, state),
        () => consumeBudget(options),
      );
      if (effect.as) {
        variables(scope)[effect.as] = output;
        const resultType = effectResultType(ctx, effect, scope);
        if (resultType) recordTypes(scope)[effect.as] = resultType;
      }
      if (effect.compensate) {
        state.compensations.push({
          ...effect.compensate,
          params: resolveObject(
            effect.compensate.params ?? {},
            scope,
          ) as AutomationEffectCall["params"],
        });
      }
    } else if ("invoke" in step) {
      const nested = options.getWorkflow(step.invoke.workflow);
      if (!nested) throw new Error(`Unknown workflow ${step.invoke.workflow}`);
      const result = await invokeWorkflow(
        ctx,
        nested,
        resolveObject(step.invoke.input ?? {}, scope),
        exec,
        {
          ...options,
          depth: (options.depth ?? 0) + 1,
          collectCompensations: (calls) => state.compensations.push(...calls),
        },
      );
      state.changes.push(...result.changes);
      if (step.invoke.as) variables(scope)[step.invoke.as] = result.output;
    } else if ("foreach" in step) {
      const source = resolveValue(step.foreach.source, scope);
      if (!Array.isArray(source)) throw new Error("Foreach source must resolve to an array");
      const maximum = step.foreach.max ?? 1_000;
      if (source.length > maximum) throw new Error(`Foreach exceeds its limit of ${maximum}`);
      const name = step.foreach.as ?? "item";
      const vars = variables(scope);
      const previous = vars[name];
      const previousType = recordTypes(scope)[name];
      const sourceName = step.foreach.source.$ref.match(/^vars\.([^.]+)/)?.[1];
      const itemType = sourceName ? recordTypes(scope)[sourceName] : undefined;
      if (itemType) recordTypes(scope)[name] = itemType;
      for (const item of source) {
        vars[name] = item;
        const itemState: RunState = { changes: [], compensations: [] };
        try {
          await runSteps(ctx, step.foreach.steps, scope, exec, itemState, options);
          mergeState(state, itemState);
        } catch (error) {
          await compensate(ctx, itemState, scope, exec);
          if (step.foreach.on_item_failure !== "continue") throw error;
        }
      }
      restoreScopeValue(vars, name, previous);
      restoreScopeValue(recordTypes(scope), name, previousType);
    } else if ("repeat" in step) {
      const raw = resolveValue(step.repeat.times, scope);
      const count = typeof raw === "number" ? raw : Number.NaN;
      const maximum = step.repeat.max ?? 1_000;
      if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
        throw new Error(`Repeat count must be an integer from 0 to ${maximum}`);
      }
      const name = step.repeat.as ?? "index";
      const vars = variables(scope);
      const previous = vars[name];
      for (let index = 0; index < count; index += 1) {
        vars[name] = index;
        const itemState: RunState = { changes: [], compensations: [] };
        try {
          await runSteps(ctx, step.repeat.steps, scope, exec, itemState, options);
          mergeState(state, itemState);
        } catch (error) {
          await compensate(ctx, itemState, scope, exec);
          if (step.repeat.on_item_failure !== "continue") throw error;
        }
      }
      restoreScopeValue(vars, name, previous);
    } else if ("parallel" in step) {
      const initial = structuredClone(scope);
      const successes: Scope[] = [];
      const failures: unknown[] = [];
      for (const branch of step.parallel.branches) {
        const branchScope = structuredClone(initial);
        const branchState: RunState = { changes: [], compensations: [] };
        try {
          await runSteps(ctx, branch.steps, branchScope, exec, branchState, options);
          mergeState(state, branchState);
          successes.push(branchScope);
        } catch (error) {
          await compensate(ctx, branchState, branchScope, exec);
          failures.push(error);
        }
      }
      if ((step.parallel.join ?? "all") === "all" && failures.length) throw failures[0];
      if ((step.parallel.join ?? "all") === "any" && successes.length === 0) throw failures[0];
      for (const branchScope of successes) Object.assign(variables(scope), variables(branchScope));
      for (const branchScope of successes)
        Object.assign(recordTypes(scope), recordTypes(branchScope));
    } else if ("delay" in step) {
      await waitMilliseconds(parseDuration(step.delay.duration));
    } else if ("wait" in step) {
      if (step.wait.signal) {
        throw new Error("This runtime cannot resume workflows from signals");
      }
      if (step.wait.timeout === undefined) throw new Error("Wait needs a signal or timeout");
      await waitMilliseconds(parseDuration(step.wait.timeout));
      if (step.wait.as) variables(scope)[step.wait.as] = { outcome: "timeout" };
      if (step.wait.on_timeout) {
        await runSteps(ctx, step.wait.on_timeout, scope, exec, state, options);
      }
    }
  }
}

async function executeEffect(
  ctx: QueryContext,
  call: AutomationEffectCall,
  scope: Scope,
  exec: ExecutionContext,
  state: RunState,
): Promise<unknown> {
  const params = resolveObject(call.params ?? {}, scope);
  if (call.key === "null") return null;
  if (call.key === "records.create") {
    const result = await createRecord(
      ctx,
      scalarString(params.type),
      asObject(params.fields),
      exec,
    );
    state.changes.push(result.change);
    return result.record;
  }
  if (call.key === "records.set") {
    const record = params.record;
    if (!isRecord(record)) throw new Error("records.set needs a record binding");
    const typeKey = recordType(ctx, record, scope);
    const result = await updateRecord(ctx, typeKey, record.id, asObject(params.values), exec);
    state.changes.push(result.change);
    replaceRecordInScope(scope, record.id, result.record);
    return result.record;
  }
  if (call.key === "records.delete") {
    const record = params.record;
    if (!isRecord(record)) throw new Error("records.delete needs a record binding");
    const result = await deleteRecord(ctx, recordType(ctx, record, scope), record.id);
    state.changes.push(result.change);
    return null;
  }
  if (call.key === "records.query") {
    if (params.view) {
      const view = ctx.spec.views.find((item) => item.key === scalarString(params.view));
      if (!view) throw new Error(`Unknown view ${scalarString(params.view)}`);
      return executeView(ctx, view);
    }
    const type = findType(ctx, scalarString(params.type));
    if (!type) throw new Error(`Unknown type ${scalarString(params.type)}`);
    return ctx.engineFor(type).select(type.key, { where: asObject(params.where) });
  }
  throw new Error(`Unknown effect ${call.key}`);
}

async function compensate(
  ctx: QueryContext,
  state: RunState,
  scope: Scope,
  exec: ExecutionContext,
) {
  for (const call of [...state.compensations].reverse()) {
    try {
      await executeEffect(ctx, call, scope, exec, state);
    } catch {
      // Preserve the original execution failure. Durable hosts should record this receipt.
    }
  }
}

async function withRetry<T>(
  retry: { max: number; backoff?: number[] } | undefined,
  execute: () => Promise<T>,
  onRetry: () => void,
): Promise<T> {
  const maximum = retry?.max ?? 1;
  let failure: unknown;
  for (let attempt = 0; attempt < maximum; attempt += 1) {
    if (attempt > 0) {
      onRetry();
      await waitMilliseconds((retry?.backoff?.[attempt - 1] ?? 0) * 1_000);
    }
    try {
      return await execute();
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export function evaluateCondition(condition: AutomationPredicate, scope: Scope): boolean {
  const raw = condition as Record<string, unknown>;
  if (Array.isArray(raw.all))
    return raw.all.every((item) => evaluateCondition(item as AutomationPredicate, scope));
  if (Array.isArray(raw.any))
    return raw.any.some((item) => evaluateCondition(item as AutomationPredicate, scope));
  if (raw.not && typeof raw.not === "object")
    return !evaluateCondition(raw.not as AutomationPredicate, scope);
  const leaf = condition as AutomationCondition;
  const path = scalarString(leaf.path);
  const actual = lookupPath(scope, path);
  const expected = resolveValue(leaf.value, scope);
  if (leaf.op === "always") return true;
  if (leaf.op === "context.empty") return isEmpty(actual);
  if (!path || actual === undefined) return false;
  if (leaf.op === "context.equals") return jsonEqual(actual, expected);
  if (leaf.op === "context.not_equals") return !jsonEqual(actual, expected);
  if (leaf.op === "context.filled") return !isEmpty(actual);
  if (leaf.op === "context.in") {
    const values = resolveValue(leaf.values, scope);
    return Array.isArray(values) && values.some((value) => jsonEqual(actual, value));
  }
  if (leaf.op === "context.contains") {
    return Array.isArray(actual)
      ? actual.some((value) => jsonEqual(value, expected))
      : typeof actual === "string" &&
          (typeof expected === "string" || typeof expected === "number") &&
          actual.includes(String(expected));
  }
  if (leaf.op === "context.compare") {
    if (
      !(
        (typeof actual === "number" && typeof expected === "number") ||
        (typeof actual === "string" && typeof expected === "string")
      )
    )
      return false;
    const left = actual;
    const right = expected;
    if (leaf.operator === "gt") return left > right;
    if (leaf.operator === "gte") return left >= right;
    if (leaf.operator === "lt") return left < right;
    if (leaf.operator === "lte") return left <= right;
  }
  throw new Error(`Unknown condition ${leaf.op}`);
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]))
    );
  }
  return false;
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
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, scope));
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && typeof object.$ref === "string") {
      return lookupPath(scope, object.$ref);
    }
    return resolveObject(object, scope);
  }
  return value;
}

function directVariableBinding(value: unknown): string | undefined {
  if (!isPlainObject(value) || Object.keys(value).length !== 1) return undefined;
  if (typeof value.$ref !== "string") return undefined;
  return /^vars\.([^.]+)$/.exec(value.$ref)?.[1];
}

function parseDuration(value: number | string): number {
  if (typeof value === "number") return Math.max(0, value * 1_000);
  if (/^\d+$/.test(value.trim())) return Number(value) * 1_000;
  const match = /^(\d+)\s*(second|minute|hour|day)s?$/i.exec(value.trim());
  if (!match) throw new Error(`Invalid duration ${value}`);
  const scale = { second: 1, minute: 60, hour: 3_600, day: 86_400 }[
    match[2].toLowerCase() as "second" | "minute" | "hour" | "day"
  ];
  return Number(match[1]) * scale * 1_000;
}

function waitMilliseconds(duration: number): Promise<void> {
  if (duration > 2_147_483_647) {
    throw new Error("This runtime cannot keep a timer longer than 24.8 days");
  }
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function consumeBudget(options: RunOptions): void {
  const budget = options.budget as { remaining: number };
  budget.remaining -= 1;
  if (budget.remaining < 0)
    throw new Error(`Workflow exceeded its ${DEFAULT_STEP_BUDGET}-step budget`);
}

function matchesInputType(value: unknown, type: string): boolean {
  if (type === "text" || type === "date") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  return false;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRecord(value: unknown): value is RecordValue {
  return (
    Boolean(value) && typeof value === "object" && typeof (value as RecordValue).id === "string"
  );
}

function recordType(ctx: QueryContext, record: RecordValue, scope: Scope): string {
  for (const [name, value] of Object.entries(variables(scope))) {
    if (isRecord(value) && value.id === record.id) {
      const type = recordTypes(scope)[name] ?? (findType(ctx, name) ? name : undefined);
      if (type) return type;
    }
  }
  throw new Error(`Cannot infer the type of record ${record.id}`);
}

function replaceRecordInScope(scope: Scope, id: string, replacement: RecordValue): void {
  const vars = variables(scope);
  for (const [name, value] of Object.entries(vars)) {
    if (isRecord(value) && value.id === id) vars[name] = replacement;
    else if (Array.isArray(value)) {
      vars[name] = value.map((item) => (isRecord(item) && item.id === id ? replacement : item));
    }
  }
}

function variables(scope: Scope): Scope {
  return scope.vars as Scope;
}

function recordTypes(scope: Scope): Record<string, string> {
  return (scope.meta as { record_types: Record<string, string> }).record_types;
}

function effectResultType(
  ctx: QueryContext,
  effect: { key: string; params?: Record<string, unknown> },
  scope: Scope,
): string | undefined {
  if (effect.key !== "records.create" && effect.key !== "records.query") return undefined;
  const type = resolveValue(effect.params?.type, scope);
  if (typeof type === "string" && findType(ctx, type)) return type;
  const viewKey = resolveValue(effect.params?.view, scope);
  if (typeof viewKey === "string") {
    return ctx.spec.views.find((view) => view.key === viewKey)?.source;
  }
  return undefined;
}

function restoreScopeValue(scope: Scope, name: string, previous: unknown): void {
  if (previous === undefined) delete scope[name];
  else scope[name] = previous;
}

function mergeState(target: RunState, source: RunState): void {
  target.changes.push(...source.changes);
  target.compensations.push(...source.compensations);
}

export function matchingTriggers(workflows: WorkflowDef[], change: ChangeEvent): WorkflowDef[] {
  return workflows
    .filter((workflow) => workflow.enabled !== false)
    .filter((workflow) => {
      const key = workflow.trigger?.key;
      if (!key) return false;
      if (key === `${change.type}.created`) return change.kind === "created";
      if (key === `${change.type}.deleted`) return change.kind === "deleted";
      if (key === `${change.type}.changed`)
        return change.kind === "updated" || change.kind === "created";
      if (key === `${change.type}.${change.transition?.key}.transitioned`) return true;
      const fieldChanged = /^(.+)\.(.+)\.changed$/.exec(key);
      return Boolean(
        fieldChanged &&
        fieldChanged[1] === change.type &&
        (change.kind === "updated" || change.kind === "created") &&
        change.changed.includes(fieldChanged[2]),
      );
    })
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}

export function matchingEventTriggers(
  workflows: WorkflowDef[],
  key: string,
  payload: Record<string, unknown>,
): WorkflowDef[] {
  return workflows
    .filter((workflow) => workflow.enabled !== false && workflow.trigger?.key === key)
    .filter((workflow) =>
      Object.entries(workflow.trigger?.config ?? {}).every(
        ([name, expected]) => JSON.stringify(payload[name]) === JSON.stringify(expected),
      ),
    )
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}
