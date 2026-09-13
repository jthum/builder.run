import { projectPreview } from "$lib/widgets/preview-fixtures.ts";

export default projectPreview({
  view: "all_tasks",
  title: "Workload by owner",
  category: "assignee",
  series: "status",
  value: "estimate",
});
