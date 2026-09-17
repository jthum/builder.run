import { projectPreview } from "$lib/blocks/preview-fixtures.ts";

export default projectPreview({
  view: "project_portfolio",
  title: "Largest engagements",
  label_field: "name",
  value_field: "budget",
  detail_field: "client.name",
  limit: 5,
});
