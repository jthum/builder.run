import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "leaderboard",
  label: "Leaderboard",
  description: "Ranks records by a numeric field.",
  category: "data",
  order: 35,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "label_field",
      label: "Label field",
      type: "field",
      of: "any",
      source: "view",
      required: true,
    },
    {
      key: "value_field",
      label: "Value field",
      type: "field",
      of: "number",
      source: "view",
      required: true,
    },
    { key: "detail_field", label: "Supporting field", type: "field", of: "any", source: "view" },
    { key: "limit", label: "Items to show", type: "number", default: 5 },
  ],
} satisfies BlockDefinition;
