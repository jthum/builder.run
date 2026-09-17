import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "stacked_bar",
  label: "Stacked bar",
  description: "A bar chart split by a second field, such as billable vs unbilled.",
  category: "charts",
  order: 90,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "category",
      label: "Group by",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
      required: true,
    },
    {
      key: "series",
      label: "Split by",
      type: "field",
      fieldKind: "choice",
      dependsOn: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", fieldKind: "number", dependsOn: "view" },
  ],
} satisfies BlockDefinition;
