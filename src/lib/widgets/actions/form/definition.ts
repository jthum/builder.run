import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "form",
  label: "Form",
  description: "A form for adding or editing a record.",
  category: "actions",
  order: 10,
  inputs: [{ key: "form", label: "Form", type: "form", required: true }],
} satisfies WidgetDef;
