import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "donut",
  label: "Donut chart",
  description: "Share of a whole from a view.",
  category: "charts",
  order: 80,
  defaultRowHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "category",
      label: "Group by",
      type: "field",
      of: "enum",
      source: "view",
      required: true,
    },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
  ],
} satisfies WidgetDef;
