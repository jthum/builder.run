import { projectPreview } from "$lib/widgets/preview-fixtures.ts";

export default projectPreview({
  view: "tasks_by_status",
  title: "Work by status",
  category: "status",
  value: "task_count",
});
