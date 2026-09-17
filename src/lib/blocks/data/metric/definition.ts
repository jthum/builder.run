import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "metric",
  label: "Metric",
  description: "A total from a view, with a sparkline when there is a date.",
  category: "data",
  order: 20,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "description",
      label: "Supporting text",
      type: "text",
      description: "Optional context shown below the value.",
    },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
    { key: "date", label: "Date field", type: "field", of: "date", source: "view" },
  ],
} satisfies BlockDefinition;
