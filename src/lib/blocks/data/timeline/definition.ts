import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "timeline",
  label: "Timeline",
  description: "Places dated records in chronological order.",
  category: "data",
  order: 65,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "description", label: "Supporting text", type: "text" },
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
    {
      key: "status_field",
      label: "Status field",
      type: "field",
      fieldKind: "choice",
      dependsOn: "view",
    },
    { key: "limit", label: "Items to show", type: "number", default: 8 },
  ],
} satisfies BlockDefinition;
