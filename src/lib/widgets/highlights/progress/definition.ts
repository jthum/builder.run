import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "progress",
  label: "Progress",
  description: "Shows a total from a view moving toward a target.",
  category: "highlights",
  order: 20,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
    { key: "target", label: "Target", type: "number", required: true, default: 100 },
    { key: "description", label: "Supporting text", type: "text" },
  ],
} satisfies WidgetDef;
