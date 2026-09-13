import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "text",
  label: "Text",
  description: "A paragraph of copy.",
  category: "content",
  order: 20,
  inputs: [{ key: "text", label: "Text", type: "textarea", required: true }],
} satisfies WidgetDef;
