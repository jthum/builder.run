import { evaluateCondition } from "$lib/runtime/workflows.ts";
import { labelFromKey } from "$lib/runtime/ids.ts";
import type { AutomationCondition, AutomationPredicate } from "$lib/runtime/automation/model.ts";
import { scalarString } from "$lib/runtime/values.ts";
import {
  parseTypeRef,
  type AppSpec,
  type FieldDef,
  type WorkflowDef,
  type WorkflowStep,
  type RecordValue,
  type TypeDef,
} from "$lib/runtime/model.ts";

export function reverseRelations(
  spec: AppSpec,
  typeKey: string,
): Array<{ type: TypeDef; field: FieldDef }> {
  const related: Array<{ type: TypeDef; field: FieldDef }> = [];
  for (const type of spec.types) {
    if (type.key === typeKey) continue;
    for (const field of type.fields) {
      if (field.type !== "reference" || !field.target) continue;
      const target = parseTypeRef(field.target).type;
      if (target === typeKey) related.push({ type, field });
    }
  }
  return related;
}

export function workflowInputName(workflow: WorkflowDef, typeKey?: string): string | undefined {
  const entries = Object.entries(workflow.input ?? {});
  if (typeKey) {
    const match = entries.find(
      ([name, input]) => name === typeKey || ("record" in input && input.record === typeKey),
    );
    return match?.[0];
  }
  return entries[0]?.[0];
}

export function callableWorkflowsFor(spec: AppSpec, typeKey: string): WorkflowDef[] {
  return spec.workflows.filter((workflow) => {
    if (workflow.trigger) return false;
    if (!workflow.expose?.includes("ui")) return false;
    return Boolean(workflowInputName(workflow, typeKey));
  });
}

export function workflowApplies(
  workflow: WorkflowDef,
  typeKey: string,
  record: RecordValue,
): boolean {
  if (workflow.trigger) return false;
  if (!workflow.expose?.includes("ui")) return false;
  const name = workflowInputName(workflow, typeKey);
  if (!name) return false;
  const guard = entryGuard(workflow);
  return !guard || evaluateCondition(guard, { vars: { [name]: record, [typeKey]: record } });
}

export function applicableWorkflows(
  spec: AppSpec,
  typeKey: string,
  record: RecordValue,
): WorkflowDef[] {
  return callableWorkflowsFor(spec, typeKey).filter((workflow) =>
    workflowApplies(workflow, typeKey, record),
  );
}

export function workflowKind(workflow: WorkflowDef): "manual" | "automatic" {
  return workflow.trigger ? "automatic" : "manual";
}

/** Workflows whose explicit trigger is one form's submission event. */
export function workflowsForForm(spec: AppSpec | undefined, formKey: string): WorkflowDef[] {
  return (spec?.workflows ?? []).filter(
    (workflow) =>
      workflow.trigger?.key === "form.submitted" && workflow.trigger.config?.form === formKey,
  );
}

export function humanTrigger(when: string, spec?: AppSpec): string {
  const created = /^(.+)\.created$/.exec(when);
  if (created) return `a ${typeLabel(spec, created[1]).toLowerCase()} is added`;
  const deleted = /^(.+)\.deleted$/.exec(when);
  if (deleted) return `a ${typeLabel(spec, deleted[1]).toLowerCase()} is deleted`;
  const field = /^(.+)\.(.+)\.changed$/.exec(when);
  if (field) {
    return `${typeLabel(spec, field[1])} ${fieldLabel(spec, field[1], field[2]).toLowerCase()} changes`;
  }
  const changed = /^(.+)\.changed$/.exec(when);
  if (changed) return `a ${typeLabel(spec, changed[1]).toLowerCase()} changes`;
  return when;
}

export function humanCondition(condition: AutomationPredicate): string {
  const raw = condition as Record<string, unknown>;
  if (Array.isArray(raw.all))
    return raw.all.map((item) => humanCondition(item as AutomationPredicate)).join(" and ");
  if (Array.isArray(raw.any))
    return raw.any.map((item) => humanCondition(item as AutomationPredicate)).join(" or ");
  if (raw.not && typeof raw.not === "object")
    return `not ${humanCondition(raw.not as AutomationPredicate)}`;
  const leaf = condition as AutomationCondition;
  const op = leaf.op === "context.not_equals" ? "is not" : "is";
  const path = typeof leaf.path === "string" ? leaf.path : "value";
  const value =
    typeof leaf.value === "string" ||
    typeof leaf.value === "number" ||
    typeof leaf.value === "boolean"
      ? String(leaf.value)
      : "value";
  return `${leafLabel(path)} ${op} ${labelFromKey(value)}`;
}

export function humanStep(step: WorkflowStep, spec?: AppSpec): string {
  if ("effect" in step && step.effect.key === "records.set") {
    const values = step.effect.params?.values;
    const input = step.effect.params?.record;
    const typeKey = isBinding(input) ? (input.$ref.split(".").at(-1) ?? "record") : "record";
    return Object.entries(isObject(values) ? values : {})
      .map(([fieldKey, value]) => {
        const field = fieldLabel(spec, typeKey, fieldKey);
        const display =
          isBinding(value) && value.$ref === "meta.now"
            ? "today"
            : labelFromKey(scalarString(value));
        return `Set ${field.toLowerCase()} to ${display}`;
      })
      .join(", ");
  }
  if ("effect" in step && step.effect.key === "records.create")
    return `Create ${typeLabel(spec, typeof step.effect.params?.type === "string" ? step.effect.params.type : "record").toLowerCase()}`;
  if ("effect" in step && step.effect.key === "records.delete") return "Delete record";
  if ("invoke" in step) return `Run ${labelFromKey(step.invoke.workflow)}`;
  if ("effect" in step && step.effect.key === "records.query")
    return `Look up ${labelFromKey(step.effect.as ?? "records")}`;
  if ("gate" in step) return `If ${humanCondition(step.gate.predicate)}`;
  if ("compute" in step) return "Calculate values";
  if ("foreach" in step) return "For each item";
  if ("repeat" in step) return "Repeat steps";
  if ("parallel" in step) return "Run branches together";
  if ("delay" in step) return "Wait for a duration";
  if ("wait" in step) return "Wait for a signal";
  return "Do something";
}

export function workflowSummary(workflow: WorkflowDef, spec?: AppSpec): string {
  const guard = entryGuard(workflow);
  const steps = (
    guard && workflow.steps[0] && "gate" in workflow.steps[0]
      ? [...(workflow.steps[0].gate.pass ?? []), ...workflow.steps.slice(1)]
      : workflow.steps
  )
    .map((step) => humanStep(step, spec))
    .filter(Boolean);
  if (workflow.trigger?.key) {
    const formKey =
      workflow.trigger.key === "form.submitted" && typeof workflow.trigger.config?.form === "string"
        ? workflow.trigger.config.form
        : undefined;
    const formLabel = formKey
      ? (spec?.forms.find((form) => form.key === formKey)?.label ?? labelFromKey(formKey))
      : undefined;
    const when = `When ${formLabel ? `${formLabel} is submitted` : humanTrigger(workflow.trigger.key, spec)}`;
    return [when, guard ? `if ${humanCondition(guard)}` : "", steps[0]].filter(Boolean).join(" · ");
  }
  const target = workflowInputName(workflow);
  const on = target ? `On ${typeLabel(spec, target)}` : "Button";
  return [on, guard ? `if ${humanCondition(guard)}` : "", steps[0]].filter(Boolean).join(" · ");
}

function entryGuard(workflow: WorkflowDef) {
  const first = workflow.steps[0];
  return first && "gate" in first && !first.gate.fail ? first.gate.predicate : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBinding(value: unknown): value is { $ref: string } {
  return isObject(value) && typeof value.$ref === "string";
}

function typeLabel(spec: AppSpec | undefined, key: string): string {
  return spec?.types.find((type) => type.key === key)?.label ?? labelFromKey(key);
}

function fieldLabel(spec: AppSpec | undefined, typeKey: string, fieldKey: string): string {
  const field = spec?.types
    .find((type) => type.key === typeKey)
    ?.fields.find((item) => item.key === fieldKey);
  return field?.label ?? labelFromKey(fieldKey);
}

function leafLabel(path: string): string {
  return labelFromKey(path.split(".").at(-1) ?? path);
}
