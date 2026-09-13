import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "hero",
  label: "Hero",
  description: "A prominent introduction with context and actions.",
  category: "highlights",
  order: 10,
  inputs: [
    { key: "eyebrow", label: "Eyebrow", type: "text" },
    { key: "title", label: "Title", type: "text", required: true, default: "Welcome" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "badge", label: "Badge", type: "text" },
    { key: "primary_label", label: "Primary action label", type: "text" },
    { key: "primary_href", label: "Primary action link", type: "text" },
    { key: "secondary_label", label: "Secondary action label", type: "text" },
    { key: "secondary_href", label: "Secondary action link", type: "text" },
  ],
} satisfies WidgetDef;
