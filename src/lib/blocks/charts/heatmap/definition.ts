import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "heatmap",
  label: "Activity heatmap",
  description: "Shows the intensity of records across calendar days.",
  category: "charts",
  order: 70,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "date",
      label: "Date field",
      type: "field",
      fieldKind: "date",
      dependsOn: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", fieldKind: "number", dependsOn: "view" },
  ],
} satisfies BlockDefinition;
