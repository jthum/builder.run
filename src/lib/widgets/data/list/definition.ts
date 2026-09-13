import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "list",
  label: "List",
  description: "A compact list from a view.",
  category: "data",
  order: 50,
  inputs: [{ key: "view", label: "View", type: "view", required: true }],
} satisfies WidgetDef;
