import { projectPreview } from "$lib/blocks/preview-fixtures.ts";

export default projectPreview({
  view: "tasks_by_status",
  title: "A pulse on delivery",
  status_field: "status",
  value_field: "task_count",
  description: "How work is moving across the team",
});
