import { DEFAULT_AUTOMATION_REGISTRY } from "./registry.ts";
import type { AutomationRegistry, AutomationStep } from "./model.ts";

export interface AutomationDiagnostic {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface AutomationValidationResult {
  valid: boolean;
  diagnostics: AutomationDiagnostic[];
}

export function validateAutomation(
  input: unknown,
  registry: AutomationRegistry = DEFAULT_AUTOMATION_REGISTRY,
): AutomationValidationResult {
  const diagnostics: AutomationDiagnostic[] = [];
  const report = (severity: "error" | "warning", code: string, path: string, message: string) =>
    diagnostics.push({ severity, code, path, message });
  if (!isObject(input)) {
    report("error", "automation.object", "$", "Automation must be an object");
    return finish(diagnostics);
  }
  for (const key of Object.keys(input)) {
    if (
      ![
        "id",
        "meta",
        "key",
        "label",
        "description",
        "enabled",
        "priority",
        "input",
        "trigger",
        "expose",
        "steps",
      ].includes(key)
    ) {
      report("error", "automation.property", `$.${key}`, `Unknown automation property ${key}`);
    }
  }
  if (!text(input.key)) report("error", "automation.key", "$.key", "Key is required");
  if (!text(input.label)) report("error", "automation.label", "$.label", "Label is required");
  if (input.description !== undefined && typeof input.description !== "string")
    report("error", "automation.description", "$.description", "Description must be a string");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean")
    report("error", "automation.enabled", "$.enabled", "Enabled must be boolean");
  if (input.priority !== undefined && !Number.isInteger(input.priority))
    report("error", "automation.priority", "$.priority", "Priority must be an integer");
  if (
    input.expose !== undefined &&
    (!Array.isArray(input.expose) || input.expose.some((item) => item !== "ui" && item !== "agent"))
  )
    report("error", "automation.expose", "$.expose", "Expose may contain only ui and agent");
  if (!Array.isArray(input.steps)) {
    report("error", "automation.steps", "$.steps", "Steps must be an array");
  } else {
    validateSteps(input.steps, "$.steps", registry, report, new Set());
  }
  if (input.trigger !== undefined && (!isObject(input.trigger) || !text(input.trigger.key))) {
    report("error", "automation.trigger", "$.trigger.key", "Trigger key is required");
  } else if (
    isObject(input.trigger) &&
    input.trigger.config !== undefined &&
    !isObject(input.trigger.config)
  ) {
    report("error", "trigger.config", "$.trigger.config", "Trigger config must be an object");
  } else if (isObject(input.trigger)) {
    reportUnknown(input.trigger, ["key", "config"], "$.trigger", report);
  }
  if (input.input !== undefined && !isObject(input.input)) {
    report("error", "automation.input", "$.input", "Input must be an object");
  } else if (isObject(input.input)) {
    for (const [name, definition] of Object.entries(input.input)) {
      const path = `$.input.${name}`;
      if (!text(name)) report("error", "input.name", path, "Input name must be non-empty");
      if (!isObject(definition)) {
        report("error", "input.object", path, "Input definition must be an object");
        continue;
      }
      reportUnknown(definition, ["record", "value", "required", "default"], path, report);
      if (definition.required !== undefined && typeof definition.required !== "boolean")
        report("error", "input.required", `${path}.required`, "Required must be boolean");
      const kinds = ["record", "value"].filter((key) => Object.hasOwn(definition, key));
      if (kinds.length !== 1) {
        report("error", "input.kind", path, "Input must declare exactly one record or value kind");
      } else if ("record" in definition && !text(definition.record)) {
        report("error", "input.record", `${path}.record`, "Record type is required");
      } else if (
        "value" in definition &&
        !["text", "number", "boolean", "date", "object", "array"].includes(String(definition.value))
      ) {
        report("error", "input.value", `${path}.value`, "Input value kind is invalid");
      }
    }
  }
  return finish(diagnostics);
}

export function assertValidAutomation(input: unknown): void {
  const result = validateAutomation(input);
  const errors = result.diagnostics.filter((item) => item.severity === "error");
  if (errors.length) {
    throw new Error(errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  }
}

function validateSteps(
  steps: unknown[],
  path: string,
  registry: AutomationRegistry,
  report: (severity: "error" | "warning", code: string, path: string, message: string) => void,
  ids: Set<string>,
): void {
  steps.forEach((raw, index) => {
    const at = `${path}.${index}`;
    if (!isObject(raw)) {
      report("error", "step.object", at, "Step must be an object");
      return;
    }
    const kinds = [
      "gate",
      "compute",
      "effect",
      "invoke",
      "delay",
      "wait",
      "foreach",
      "repeat",
      "parallel",
    ].filter((key) => Object.hasOwn(raw, key));
    if (kinds.length !== 1) {
      report("error", "step.kind", at, "Step must contain exactly one primitive");
      return;
    }
    if (!isObject(raw[kinds[0]])) {
      report("error", "step.config", `${at}.${kinds[0]}`, "Step configuration must be an object");
      return;
    }
    for (const key of Object.keys(raw)) {
      if (key !== "id" && key !== kinds[0]) {
        report("error", "step.property", `${at}.${key}`, `Unknown step property ${key}`);
      }
    }
    if (raw.id !== undefined) {
      if (!text(raw.id)) report("error", "step.id", `${at}.id`, "Step id must be non-empty");
      else if (ids.has(raw.id))
        report("error", "step.id_duplicate", `${at}.id`, `Duplicate step id ${raw.id}`);
      else ids.add(raw.id);
    }
    const step = raw as unknown as AutomationStep;
    if ("effect" in step) {
      reportUnknown(
        step.effect,
        ["key", "params", "as", "retry", "compensate"],
        `${at}.effect`,
        report,
      );
      if (!text(step.effect?.key))
        report("error", "effect.key", `${at}.effect.key`, "Effect key is required");
      else if (!registry.effects.has(step.effect.key)) {
        report(
          "warning",
          "effect.unresolved",
          `${at}.effect.key`,
          `Effect ${step.effect.key} is not installed in this host`,
        );
      }
      if (
        step.effect.retry &&
        (!Number.isInteger(step.effect.retry.max) || step.effect.retry.max < 1)
      ) {
        report(
          "error",
          "effect.retry",
          `${at}.effect.retry.max`,
          "Retry max must be a positive integer",
        );
      }
      if (step.effect.params !== undefined && !isObject(step.effect.params))
        report("error", "effect.params", `${at}.effect.params`, "Effect params must be an object");
      if (step.effect.as !== undefined && !text(step.effect.as))
        report("error", "effect.as", `${at}.effect.as`, "Effect result name must be non-empty");
      if (
        step.effect.retry?.backoff !== undefined &&
        (!Array.isArray(step.effect.retry.backoff) ||
          step.effect.retry.backoff.some(
            (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0,
          ))
      )
        report(
          "error",
          "effect.backoff",
          `${at}.effect.retry.backoff`,
          "Retry backoff must contain non-negative seconds",
        );
      if (step.effect.compensate !== undefined) {
        validateEffectCall(step.effect.compensate, `${at}.effect.compensate`, registry, report);
      }
    } else if ("gate" in step) {
      reportUnknown(step.gate, ["predicate", "pass", "fail"], `${at}.gate`, report);
      validatePredicate(step.gate?.predicate, `${at}.gate.predicate`, registry, report);
      validateChildSteps(step.gate?.pass, `${at}.gate.pass`, registry, report, ids);
      validateChildSteps(step.gate?.fail, `${at}.gate.fail`, registry, report, ids);
    } else if ("compute" in step) {
      reportUnknown(step.compute, ["assign"], `${at}.compute`, report);
      if (!isObject(step.compute?.assign))
        report(
          "error",
          "compute.assign",
          `${at}.compute.assign`,
          "Compute assign must be an object",
        );
    } else if ("invoke" in step) {
      reportUnknown(step.invoke, ["workflow", "input", "as"], `${at}.invoke`, report);
      if (!text(step.invoke?.workflow))
        report(
          "error",
          "invoke.workflow",
          `${at}.invoke.workflow`,
          "Invoked workflow key is required",
        );
      if (step.invoke.input !== undefined && !isObject(step.invoke.input))
        report("error", "invoke.input", `${at}.invoke.input`, "Invoke input must be an object");
    } else if ("delay" in step) {
      reportUnknown(step.delay, ["duration"], `${at}.delay`, report);
      if (!isDuration(step.delay.duration))
        report("error", "delay.duration", `${at}.delay.duration`, "Delay duration is invalid");
    } else if ("foreach" in step) {
      reportUnknown(
        step.foreach,
        ["source", "as", "max", "on_item_failure", "steps"],
        `${at}.foreach`,
        report,
      );
      if (!isBinding(step.foreach?.source))
        report(
          "error",
          "foreach.source",
          `${at}.foreach.source`,
          "Foreach source must be a $ref binding",
        );
      validateLimit(step.foreach?.max, `${at}.foreach.max`, report);
      validateItemFailure(step.foreach?.on_item_failure, `${at}.foreach.on_item_failure`, report);
      validateChildSteps(step.foreach?.steps, `${at}.foreach.steps`, registry, report, ids, true);
    } else if ("repeat" in step) {
      reportUnknown(
        step.repeat,
        ["times", "as", "max", "on_item_failure", "steps"],
        `${at}.repeat`,
        report,
      );
      if (
        !(
          (typeof step.repeat?.times === "number" &&
            Number.isSafeInteger(step.repeat.times) &&
            step.repeat.times >= 0) ||
          isBinding(step.repeat?.times)
        )
      )
        report(
          "error",
          "repeat.times",
          `${at}.repeat.times`,
          "Repeat times must be a number or $ref binding",
        );
      validateLimit(step.repeat?.max, `${at}.repeat.max`, report);
      validateItemFailure(step.repeat?.on_item_failure, `${at}.repeat.on_item_failure`, report);
      validateChildSteps(step.repeat?.steps, `${at}.repeat.steps`, registry, report, ids, true);
    } else if ("parallel" in step) {
      reportUnknown(step.parallel, ["branches", "join"], `${at}.parallel`, report);
      if (
        step.parallel.join !== undefined &&
        step.parallel.join !== "all" &&
        step.parallel.join !== "any"
      )
        report("error", "parallel.join", `${at}.parallel.join`, "Parallel join must be all or any");
      if (!Array.isArray(step.parallel?.branches) || step.parallel.branches.length === 0)
        report(
          "error",
          "parallel.branches",
          `${at}.parallel.branches`,
          "Parallel needs at least one branch",
        );
      if (Array.isArray(step.parallel?.branches)) {
        for (const [branchIndex, branch] of step.parallel.branches.entries()) {
          if (!isObject(branch)) {
            report(
              "error",
              "parallel.branch",
              `${at}.parallel.branches.${branchIndex}`,
              "Parallel branch must be an object",
            );
            continue;
          }
          reportUnknown(branch, ["key", "steps"], `${at}.parallel.branches.${branchIndex}`, report);
          validateChildSteps(
            branch.steps,
            `${at}.parallel.branches.${branchIndex}.steps`,
            registry,
            report,
            ids,
            true,
          );
        }
      }
    } else if ("wait" in step) {
      reportUnknown(
        step.wait,
        ["signal", "timeout", "as", "on_signal", "on_timeout"],
        `${at}.wait`,
        report,
      );
      if (!step.wait?.signal && step.wait?.timeout === undefined)
        report("error", "wait.outcome", `${at}.wait`, "Wait needs a signal or timeout");
      if (step.wait.signal !== undefined && !text(step.wait.signal))
        report("error", "wait.signal", `${at}.wait.signal`, "Wait signal must be non-empty");
      if (step.wait.timeout !== undefined && !isDuration(step.wait.timeout))
        report("error", "wait.timeout", `${at}.wait.timeout`, "Wait timeout is invalid");
      validateChildSteps(step.wait?.on_signal, `${at}.wait.on_signal`, registry, report, ids);
      validateChildSteps(step.wait?.on_timeout, `${at}.wait.on_timeout`, registry, report, ids);
    }
  });
}

function validateEffectCall(
  value: unknown,
  path: string,
  registry: AutomationRegistry,
  report: (severity: "error" | "warning", code: string, path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    report("error", "effect.call", path, "Effect call must be an object");
    return;
  }
  reportUnknown(value, ["key", "params"], path, report);
  if (!text(value.key)) report("error", "effect.key", `${path}.key`, "Effect key is required");
  else if (!registry.effects.has(value.key))
    report(
      "warning",
      "effect.unresolved",
      `${path}.key`,
      `Effect ${value.key} is not installed in this host`,
    );
  if (value.params !== undefined && !isObject(value.params))
    report("error", "effect.params", `${path}.params`, "Effect params must be an object");
}

function validateItemFailure(
  value: unknown,
  path: string,
  report: (severity: "error", code: string, path: string, message: string) => void,
): void {
  if (value !== undefined && value !== "stop" && value !== "continue")
    report("error", "loop.failure", path, "Item failure must be stop or continue");
}

function isDuration(value: unknown): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value) && value >= 0) ||
    (typeof value === "string" &&
      /^(?:\d+|\d+\s*(?:second|minute|hour|day)s?)$/i.test(value.trim()))
  );
}

function reportUnknown(
  value: object,
  allowed: string[],
  path: string,
  report: (severity: "error", code: string, path: string, message: string) => void,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      report("error", "property.unknown", `${path}.${key}`, `Unknown property ${key}`);
  }
}

function validateChildSteps(
  value: unknown,
  path: string,
  registry: AutomationRegistry,
  report: (severity: "error" | "warning", code: string, path: string, message: string) => void,
  ids: Set<string>,
  required = false,
): void {
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    report("error", "steps.array", path, "Nested steps must be an array");
    return;
  }
  validateSteps(value, path, registry, report, ids);
}

function validatePredicate(
  value: unknown,
  path: string,
  registry: AutomationRegistry,
  report: (severity: "error" | "warning", code: string, path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    report("error", "predicate.object", path, "Predicate must be an object");
    return;
  }
  const kinds = ["all", "any", "not", "op"].filter((key) => Object.hasOwn(value, key));
  if (kinds.length !== 1)
    report("error", "predicate.kind", path, "Predicate must contain exactly one combinator or op");
  if ("all" in value || "any" in value) {
    const children = "all" in value ? value.all : value.any;
    if (!Array.isArray(children))
      report("error", "predicate.children", path, "Predicate children must be an array");
    else
      children.forEach((child, index) =>
        validatePredicate(child, `${path}.${index}`, registry, report),
      );
  } else if ("not" in value) validatePredicate(value.not, `${path}.not`, registry, report);
  else if (!text(value.op))
    report("error", "predicate.op", `${path}.op`, "Condition op is required");
  else if (!registry.conditions.has(value.op))
    report(
      "warning",
      "predicate.unresolved",
      `${path}.op`,
      `Condition ${value.op} is not installed in this host`,
    );
}

function validateLimit(
  value: unknown,
  path: string,
  report: (severity: "error", code: string, path: string, message: string) => void,
): void {
  if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1))
    report("error", "loop.max", path, "Loop max must be a positive integer");
}

function finish(diagnostics: AutomationDiagnostic[]): AutomationValidationResult {
  return { valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBinding(value: unknown): value is { $ref: string } {
  return isObject(value) && Object.keys(value).length === 1 && text(value.$ref);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
