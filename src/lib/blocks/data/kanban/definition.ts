import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "kanban",
  label: "Board",
  description: "Cards from a view, in columns by an enum field.",
  category: "data",
  order: 100,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "field",
      label: "Column field",
      type: "field",
      of: "enum",
      source: "view",
      required: true,
      description: "Enum field whose choices become the board columns.",
    },
  ],
} satisfies BlockDefinition;
