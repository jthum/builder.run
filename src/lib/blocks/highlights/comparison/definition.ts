import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "comparison",
  label: "Comparison",
  description: "A metric compared with a target or another view.",
  category: "highlights",
  order: 25,
  inputs: [
    { key: "view", label: "Current view", type: "view", required: true },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
    { key: "target", label: "Target", type: "number" },
    { key: "comparison_view", label: "Comparison view", type: "view" },
    {
      key: "comparison_value",
      label: "Comparison value field",
      type: "field",
      of: "number",
      source: "comparison_view",
    },
    { key: "reference_label", label: "Comparison label", type: "text" },
    { key: "description", label: "Supporting text", type: "text" },
  ],
} satisfies BlockDefinition;
