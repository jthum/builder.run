import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "bar",
  label: "Bar chart",
  description: "Counts or sums from a view, grouped by a field.",
  category: "charts",
  order: 60,
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
      description: "Field used for the bars on the category axis.",
    },
    {
      key: "value",
      label: "Value field",
      type: "field",
      of: "number",
      source: "view",
      description: "Numeric field to sum. Omit it to count rows instead.",
    },
  ],
} satisfies BlockDefinition;
