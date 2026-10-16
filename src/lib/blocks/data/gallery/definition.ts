import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "gallery",
  label: "Image gallery",
  description: "A visual collection of record images with captions and links to their details.",
  category: "data",
  order: 80,
  defaultHeight: "m",
  inputs: [
    { key: "view", label: "View", type: "view", required: true },
    {
      key: "image_field",
      label: "Image URL field",
      type: "field",
      fieldKind: "any",
      dependsOn: "view",
      required: true,
      description:
        "An https:// image address or an app-relative path. Images load only as they approach the viewport.",
    },
    {
      key: "title_field",
      label: "Caption field",
      type: "field",
      fieldKind: "any",
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
    { key: "limit", label: "Items to show", type: "number", default: 6 },
    { key: "description", label: "Supporting text", type: "text" },
  ],
} satisfies BlockDefinition;
