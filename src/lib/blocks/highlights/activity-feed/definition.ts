import type { BlockDefinition } from "$lib/blocks/types.ts";

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
      fieldKind: "any",
      dependsOn: "view",
      required: true,
    },
    {
      key: "description_field",
      label: "Description field",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
    },
    {
      key: "date_field",
      label: "Date field",
      type: "field",
      fieldKind: "date",
      dependsOn: "view",
      required: true,
    },
    { key: "limit", label: "Items to show", type: "number", default: 5 },
  ],
} satisfies BlockDefinition;
