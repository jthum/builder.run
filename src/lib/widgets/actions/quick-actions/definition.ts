import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "quick_actions",
  label: "Quick actions",
  description: "A compact group of frequently used workflow actions.",
  category: "actions",
  order: 5,
  inputs: [
    { key: "title", label: "Title", type: "text", default: "Quick actions" },
    { key: "description", label: "Description", type: "text" },
    { key: "first_workflow", label: "First workflow", type: "workflow", required: true },
    { key: "first_label", label: "First label", type: "text" },
    { key: "second_workflow", label: "Second workflow", type: "workflow" },
    { key: "second_label", label: "Second label", type: "text" },
    { key: "third_workflow", label: "Third workflow", type: "workflow" },
    { key: "third_label", label: "Third label", type: "text" },
  ],
} satisfies WidgetDef;
