import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "timeline",
  label: "Timeline",
  description: "Places dated records in chronological order.",
  category: "data",
  order: 65,
  defaultRowHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    { key: "description", label: "Supporting text", type: "text" },
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
    { key: "status_field", label: "Status field", type: "field", of: "enum", source: "view" },
    { key: "limit", label: "Items to show", type: "number", default: 8 },
  ],
} satisfies BlockDefinition;
