import type { WidgetPreview } from "$lib/widgets/types.ts";

export default {
  values: {
    title: "Review needed",
    text: "Two blocked tasks need an owner before Friday.",
    tone: "warning",
  },
} satisfies WidgetPreview;
