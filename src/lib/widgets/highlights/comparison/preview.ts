import { projectPreview } from "$lib/widgets/preview-fixtures.ts";

export default projectPreview({
  view: "project_portfolio",
  title: "Budget committed",
  value: "spent",
  target: 45_000,
  reference_label: "of quarterly plan",
  description: "Across the active client portfolio",
});
