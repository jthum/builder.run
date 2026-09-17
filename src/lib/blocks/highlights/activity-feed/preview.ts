import { projectPreview } from "$lib/blocks/preview-fixtures.ts";

export default projectPreview({
  view: "all_tasks",
  title: "Upcoming activity",
  title_field: "title",
  description_field: "project.name",
  date_field: "due_date",
  limit: 4,
});
