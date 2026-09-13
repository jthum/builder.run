import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "funnel",
  label: "Funnel",
  description: "Shows volume moving through ordered stages.",
  category: "charts",
  order: 50,
  defaultRowHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "stage",
      label: "Stage field",
      type: "field",
      of: "any",
      source: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
  ],
} satisfies WidgetDef;
