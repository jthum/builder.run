import { projectPreview } from "$lib/blocks/preview-fixtures.ts";
import type { BlockPreview } from "$lib/blocks/types.ts";

const preview = projectPreview({
  view: "project_portfolio",
  title: "Work worth sharing",
  image_field: "cover",
  title_field: "name",
  description_field: "client.name",
  description: "A look inside the portfolio",
  limit: 3,
});
const photos = [
  "photo-1497366754035-f200968a6e72",
  "photo-1494438639946-1ebd1d20bf85",
  "photo-1499750310107-5fef28a66643",
];

export default {
  ...preview,
  spec: {
    ...preview.spec!,
    types: preview.spec!.types.map((type) =>
      type.key === "project"
        ? {
            ...type,
            fields: [
              ...type.fields,
              {
                id: "preview_cover",
                key: "cover",
                label: "Cover image",
                type: "text",
                format: "url",
              },
            ],
          }
        : type,
    ),
    views: preview.spec!.views.map((view) =>
      view.key === "project_portfolio" ? { ...view, fields: [...view.fields, "cover"] } : view,
    ),
  },
  rows: {
    ...preview.rows,
    project_portfolio: preview.rows!.project_portfolio!.map((row, index) => ({
      ...row,
      cover: `https://images.unsplash.com/${photos[index]}?auto=format&fit=crop&w=640&q=80`,
    })),
  },
} satisfies BlockPreview;
