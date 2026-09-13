import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "calendar",
  label: "Calendar",
  description: "Records from a view, placed on a month by a date field.",
  category: "data",
  order: 110,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "date", label: "Date field", type: "field", of: "date", source: "view", required: true },
  ],
} satisfies WidgetDef;
