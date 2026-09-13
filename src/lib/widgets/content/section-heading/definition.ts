import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "section_heading",
  label: "Section heading",
  description: "Introduces a new part of a page with an optional action.",
  category: "content",
  order: 5,
  inputs: [
    { key: "eyebrow", label: "Eyebrow", type: "text" },
    { key: "title", label: "Title", type: "text", required: true, default: "Section" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "action_label", label: "Action label", type: "text" },
    { key: "action_href", label: "Action link", type: "text" },
  ],
} satisfies WidgetDef;
