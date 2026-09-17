import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "heading",
  label: "Heading",
  description: "A title and optional supporting text.",
  category: "content",
  order: 10,
  inputs: [
    { key: "title", label: "Title", type: "text", required: true, default: "Heading" },
    { key: "description", label: "Description", type: "textarea" },
  ],
} satisfies BlockDefinition;
