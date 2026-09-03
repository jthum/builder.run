import { evaluateCondition } from "$lib/runtime/flows.ts";
import { labelFromKey } from "$lib/runtime/ids.ts";
import {
  parseTypeRef,
  type AppSpec,
  type FieldDef,
  type FlowDef,
  type FlowStep,
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

export function flowInputName(flow: FlowDef, typeKey?: string): string | undefined {
  const entries = Object.entries(flow.input ?? {});
  if (typeKey) {
    const match = entries.find(
      ([name, expr]) => name === typeKey || expr.includes(`ref(${typeKey})`),
    );
    return match?.[0];
  }
  return entries[0]?.[0];
}

export function callableFlowsFor(spec: AppSpec, typeKey: string): FlowDef[] {
  return spec.flows.filter((flow) => {
    if (flow.trigger) return false;
    if (!flow.expose?.includes("ui")) return false;
    return Boolean(flowInputName(flow, typeKey));
  });
}

export function flowApplies(flow: FlowDef, typeKey: string, record: RecordValue): boolean {
  if (flow.trigger) return false;
  if (!flow.expose?.includes("ui")) return false;
  const name = flowInputName(flow, typeKey);
  if (!name) return false;
  if (!flow.when) return true;
  return evaluateCondition(flow.when, { [name]: record, [typeKey]: record });
}

export function applicableFlows(spec: AppSpec, typeKey: string, record: RecordValue): FlowDef[] {
  return callableFlowsFor(spec, typeKey).filter((flow) => flowApplies(flow, typeKey, record));
}

export function flowKind(flow: FlowDef): "button" | "rule" {
  return flow.trigger ? "rule" : "button";
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

export function humanCondition(condition: FlowDef["when"]): string {
  if (!condition) return "";
  if (typeof condition !== "string") {
    return Object.entries(condition)
      .map(([path, value]) => `${leafLabel(path)} is ${labelFromKey(String(value))}`)
      .join(" and ");
  }
  const match = condition.match(/^\s*(.+?)\s*(==|!=)\s*(.+?)\s*$/);
  if (!match) return condition;
  const op = match[2] === "!=" ? "is not" : "is";
  return `${leafLabel(match[1])} ${op} ${labelFromKey(match[3].replace(/^['"]|['"]$/g, ""))}`;
}

export function humanStep(step: FlowStep, spec?: AppSpec): string {
  if ("set" in step) {
    return Object.entries(step.set)
      .map(([path, value]) => {
        const [typeKey, fieldKey] = path.split(".", 2);
        const field = fieldKey ? fieldLabel(spec, typeKey, fieldKey) : leafLabel(path);
        const display = value === "now" ? "today" : labelFromKey(String(value));
        return `Set ${field.toLowerCase()} to ${display}`;
      })
      .join(", ");
  }
  if ("create" in step) return `Create ${typeLabel(spec, step.create.type).toLowerCase()}`;
  if ("delete" in step) return `Delete ${labelFromKey(step.delete.ref).toLowerCase()}`;
  if ("invoke" in step) return `Run ${labelFromKey(step.invoke.flow)}`;
  if ("query" in step) return `Look up ${labelFromKey(step.query.as)}`;
  if ("when" in step) return `If ${humanCondition(step.when.condition)}`;
  return "Do something";
}

export function flowSummary(flow: FlowDef, spec?: AppSpec): string {
  const steps = flow.steps.map((step) => humanStep(step, spec)).filter(Boolean);
  if (flow.trigger?.when) {
    const when = `When ${humanTrigger(flow.trigger.when, spec)}`;
    const guard = flow.when ? `if ${humanCondition(flow.when)}` : "";
    return [when, guard, steps[0]].filter(Boolean).join(" · ");
  }
  const target = flowInputName(flow);
  const on = target ? `On ${typeLabel(spec, target)}` : "Button";
  const guard = flow.when ? `if ${humanCondition(flow.when)}` : "";
  return [on, guard, steps[0]].filter(Boolean).join(" · ");
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
