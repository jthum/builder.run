import type { WidgetDef } from "$lib/widgets/types.ts";

export default {
  key: "activity_feed",
  label: "Activity feed",
  description: "A chronological stream built from records in a view.",
  category: "highlights",
  order: 40,
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
    {
      key: "date_field",
      label: "Date field",
      type: "field",
      of: "date",
      source: "view",
      required: true,
    },
    { key: "limit", label: "Items to show", type: "number", default: 5 },
  ],
} satisfies WidgetDef;
