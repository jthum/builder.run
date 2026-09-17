import type { BlockDefinition } from "$lib/blocks/types.ts";

export default {
  key: "callout",
  label: "Callout",
  description: "A short note, warning, or next step on the page.",
  category: "content",
  order: 30,
  inputs: [
    { key: "title", label: "Title", type: "text", default: "Note" },
    { key: "text", label: "Text", type: "textarea", required: true },
    {
      key: "tone",
      label: "Tone",
      type: "select",
      default: "note",
      options: [
        { value: "note", label: "Note" },
        { value: "warning", label: "Warning" },
        { value: "danger", label: "Danger" },
      ],
    },
  ],
} satisfies BlockDefinition;
