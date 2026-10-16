import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "agenda",
  label: "Agenda",
  description:
    "Dated records organised into Overdue, Today and Upcoming, with the earliest deadlines first.",
  category: "data",
  order: 68,
  defaultHeight: "m",
  inputs: [
    {
      key: "view",
      label: "View",
      type: "view",
      required: true,
      description: "Choose a View filtered to the items that still need attention.",
    },
    {
      key: "title_field",
      label: "Title field",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
      required: true,
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
      key: "description_field",
      label: "Supporting field",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
      default: "",
    },
    { key: "limit", label: "Items to show", type: "number", default: 8 },
    { key: "description", label: "Supporting text", type: "text" },
  ],
} satisfies BlockDefinition;
