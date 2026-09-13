import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "heatmap",
  label: "Activity heatmap",
  description: "Shows the intensity of records across calendar days.",
  category: "charts",
  order: 70,
  defaultRowHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "date", label: "Date field", type: "field", of: "date", source: "view", required: true },
    { key: "value", label: "Value field", type: "field", of: "number", source: "view" },
  ],
} satisfies WidgetDef;
