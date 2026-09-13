import { projectPreview } from "$lib/widgets/preview-fixtures.ts";

export default projectPreview({
  view: "all_tasks",
  title: "Delivery timeline",
  description: "Milestones ordered by due date",
  title_field: "title",
  description_field: "project.name",
  date_field: "due_date",
  status_field: "status",
  limit: 8,
});
