import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "donut",
  label: "Donut chart",
  description: "Share of a whole from a view.",
  category: "charts",
  order: 80,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "category",
      label: "Group by",
      type: "field",
      fieldKind: "choice",
      dependsOn: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", fieldKind: "number", dependsOn: "view" },
  ],
} satisfies BlockDefinition;
