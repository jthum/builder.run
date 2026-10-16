import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "navigation_card",
  label: "Navigation card",
  description:
    "A welcoming shortcut to a page, View, Form page or website. Arrange several in a layout row.",
  category: "content",
  order: 40,
  inputs: [
    { key: "title", label: "Title", type: "text", required: true, default: "Explore" },
    { key: "description", label: "Description", type: "textarea" },
    {
      key: "href",
      label: "Destination link",
      type: "text",
      required: true,
      description: "An app path such as /p/overview or /v/tasks, or a complete https:// address.",
    },
    {
      key: "eyebrow",
      label: "Small label",
      type: "text",
      description: "Optional context above the title, such as Projects or Resources.",
    },
  ],
} satisfies BlockDefinition;
