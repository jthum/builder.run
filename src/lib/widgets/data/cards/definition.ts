import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "cards",
  label: "Cards",
  description: "A grid of cards from a view.",
  category: "data",
  order: 40,
  inputs: [{ key: "view", label: "View", type: "view", required: true }],
} satisfies WidgetDef;
