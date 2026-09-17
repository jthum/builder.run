import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "line",
  label: "Line chart",
  description: "A number over time from a view.",
  category: "charts",
  order: 70,
  defaultRowHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "category",
      label: "Date field",
      type: "field",
      of: "date",
      source: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
  ],
} satisfies BlockDefinition;
