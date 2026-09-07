import type { AutomationRegistry, AutomationRegistryItem } from "./model.ts";

const conditionItems: AutomationRegistryItem[] = [
  { key: "always", label: "Always" },
  { key: "context.equals", label: "Equals", input: { path: "context path", value: "JSON value" } },
  {
    key: "context.not_equals",
    label: "Does not equal",
    input: { path: "context path", value: "JSON value" },
  },
  { key: "context.in", label: "Is one of", input: { path: "context path", values: "JSON array" } },
  { key: "context.filled", label: "Has a value", input: { path: "context path" } },
  { key: "context.empty", label: "Is empty", input: { path: "context path" } },
  {
    key: "context.compare",
    label: "Compares to",
    input: {
      path: "context path",
      operator: "gt | gte | lt | lte",
      value: "same-type number or string",
    },
  },
  {
    key: "context.contains",
    label: "Contains",
    input: { path: "context path", value: "JSON value" },
  },
];

const effectItems: AutomationRegistryItem[] = [
  { key: "null", label: "Do nothing" },
  {
    key: "records.create",
    label: "Create record",
    input: { type: "type key", fields: "field-value object" },
    output: { record: "created record" },
  },
  {
    key: "records.set",
    label: "Update record",
    input: { record: "$ref to record", values: "field-value object" },
    output: { record: "updated record" },
  },
  { key: "records.delete", label: "Delete record", input: { record: "$ref to record" } },
  {
    key: "records.query",
    label: "Query records",
    input: {
      type: "type key (or use view)",
      view: "view key (or use type)",
      where: "optional filter object",
    },
    output: { records: "record array" },
  },
];

function byKey(items: AutomationRegistryItem[]): ReadonlyMap<string, AutomationRegistryItem> {
  return new Map(items.map((item) => [item.key, item]));
}

/** Core portable vocabulary implemented by the Builder.run host. */
export const DEFAULT_AUTOMATION_REGISTRY: AutomationRegistry = {
  conditions: byKey(conditionItems),
  effects: byKey(effectItems),
};

export function extendAutomationRegistry(
  base: AutomationRegistry,
  additions: {
    conditions?: AutomationRegistryItem[];
    effects?: AutomationRegistryItem[];
  },
): AutomationRegistry {
  return {
    conditions: new Map([
      ...base.conditions,
      ...(additions.conditions ?? []).map((item) => [item.key, item] as const),
    ]),
    effects: new Map([
      ...base.effects,
      ...(additions.effects ?? []).map((item) => [item.key, item] as const),
    ]),
  };
}
