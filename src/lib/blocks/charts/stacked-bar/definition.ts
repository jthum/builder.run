import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "stacked_bar",
  label: "Stacked bar",
  description: "A bar chart split by a second field, such as billable vs unbilled.",
  category: "charts",
  order: 90,
  defaultRowHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "category",
      label: "Group by",
      type: "field",
      of: "any",
      source: "view",
      required: true,
    },
    { key: "series", label: "Split by", type: "field", of: "enum", source: "view", required: true },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
  ],
} satisfies BlockDefinition;
