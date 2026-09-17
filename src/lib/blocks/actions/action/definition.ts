import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "action",
  label: "Button",
  description: "Runs a button rule.",
  category: "actions",
  order: 20,
  inputs: [
    { key: "workflow", label: "Workflow", type: "workflow", required: true },
    { key: "label", label: "Label", type: "text", default: "Run" },
  ],
} satisfies BlockDefinition;
