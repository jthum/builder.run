import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "funnel",
  label: "Funnel",
  description: "Shows volume moving through ordered stages.",
  category: "charts",
  order: 50,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "stage",
      label: "Stage field",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", fieldKind: "number", dependsOn: "view" },
  ],
} satisfies BlockDefinition;
