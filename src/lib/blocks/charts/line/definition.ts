import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "line",
  label: "Line chart",
  description: "A number over time from a view.",
  category: "charts",
  order: 70,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "category",
      label: "Date field",
      type: "field",
      fieldKind: "date",
      dependsOn: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", fieldKind: "number", dependsOn: "view" },
  ],
} satisfies BlockDefinition;
