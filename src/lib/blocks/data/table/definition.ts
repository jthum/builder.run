import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "table",
  label: "Table",
  description: "Rows from a view, in columns.",
  category: "data",
  order: 30,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "compact", label: "Compact", type: "boolean", default: false },
  ],
} satisfies BlockDefinition;
