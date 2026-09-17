import type { BlockPreview } from "$lib/blocks/types.ts";

export default {
  config: {
    title: "Review needed",
    text: "Two blocked tasks need an owner before Friday.",
    tone: "warning",
  },
} satisfies BlockPreview;
