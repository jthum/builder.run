import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "status_breakdown",
  label: "Status breakdown",
  description: "A segmented overview with counts and percentages for each status or category.",
  category: "highlights",
  order: 25,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "status_field",
      label: "Category field",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
      required: true,
    },
    {
      key: "value_field",
      label: "Value field",
      type: "field",
      fieldKind: "number",
      dependsOn: "view",
      default: "",
      description:
        "Leave blank to count rows. For a grouped View, choose its count or sum measure. Only nonnegative values contribute.",
    },
    { key: "description", label: "Supporting text", type: "text" },
  ],
} satisfies BlockDefinition;
