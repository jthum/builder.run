import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "scatter",
  label: "Scatter plot",
  description: "Reveals the relationship between two numeric fields.",
  category: "charts",
  order: 60,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "x",
      label: "Horizontal field",
      type: "field",
      fieldKind: "number",
      dependsOn: "view",
      required: true,
    },
    {
      key: "y",
      label: "Vertical field",
      type: "field",
      fieldKind: "number",
      dependsOn: "view",
      required: true,
    },
    { key: "label", label: "Label field", type: "field", fieldKind: "any", dependsOn: "view" },
  ],
} satisfies BlockDefinition;
