import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "spotlight",
  label: "Record spotlight",
  description: "Features the first record from a view as a rich summary.",
  category: "highlights",
  order: 30,
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "title_field",
      label: "Title field",
      type: "field",
      of: "any",
      source: "view",
      required: true,
    },
    {
      key: "description_field",
      label: "Description field",
      type: "field",
      of: "any",
      source: "view",
    },
    { key: "status_field", label: "Status field", type: "field", of: "enum", source: "view" },
    { key: "action_label", label: "Action label", type: "text", default: "Open record" },
  ],
} satisfies WidgetDef;
