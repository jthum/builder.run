import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "progress",
  label: "Progress",
  description: "Shows a total from a view moving toward a target.",
  category: "highlights",
  order: 20,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "value", label: "Value field", type: "field", fieldKind: "number", dependsOn: "view" },
    { key: "target", label: "Target", type: "number", required: true, default: 100 },
    { key: "description", label: "Supporting text", type: "text" },
  ],
} satisfies BlockDefinition;
