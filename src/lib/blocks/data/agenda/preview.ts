import { projectPreview } from "$lib/blocks/preview-fixtures.ts";
import { localDay } from "./data.ts";

const preview = projectPreview({
  view: "all_tasks",
  title: "On your radar",
  title_field: "title",
  date_field: "due_date",
  description_field: "project.name",
  description: "A little focus for the days ahead",
  limit: 4,
});
const offsets = [-1, 0, 2, 4];

export default {
  ...preview,
  rows: {
    ...preview.rows,
    all_tasks: preview.rows!.all_tasks!.slice(0, offsets.length).map((row, index) => {
      const date = new Date();
      date.setDate(date.getDate() + offsets[index]!);
      return { ...row, due_date: localDay(date) };
    }),
  },
};
