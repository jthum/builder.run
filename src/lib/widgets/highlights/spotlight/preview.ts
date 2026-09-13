import { projectPreview } from "$lib/widgets/preview-fixtures.ts";

export default projectPreview({
  view: "active_projects",
  title_field: "name",
  description_field: "client.name",
  status_field: "status",
  action_label: "Open project",
});
