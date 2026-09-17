import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "stat",
  label: "Number card",
  description: "A count from a view.",
  category: "data",
  order: 10,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "description",
      label: "Supporting text",
      type: "text",
      description: "Optional context shown below the value.",
    },
  ],
} satisfies BlockDefinition;
