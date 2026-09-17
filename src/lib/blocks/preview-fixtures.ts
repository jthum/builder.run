import type { AppSpec } from "$lib/runtime/model.ts";
import { sampleApps } from "$lib/runtime/samples.ts";
import type { BlockPreview } from "./types.ts";

const baseSpec = sampleApps.find((sample) => sample.key === "project_tracker")!.spec;

export const previewSpec: AppSpec = {
  ...baseSpec,
  types: baseSpec.types.map((type) =>
    type.key === "project"
      ? {
          ...type,
          fields: [
            ...type.fields,
            { id: "preview_spent", key: "spent", label: "Spent", type: "number" },
            { id: "preview_progress", key: "progress", label: "Progress", type: "number" },
          ],
        }
      : type,
  ),
  views: [
    ...baseSpec.views.map((view) =>
      view.key === "project_portfolio"
        ? { ...view, fields: [...view.fields, "spent", "progress"] }
        : view,
    ),
    {
      ...baseSpec.views.find((view) => view.key === "tasks_by_status")!,
      id: "preview_pipeline_stages",
      key: "pipeline_stages",
      label: "Pipeline stages",
    },
  ],
};

const projects = [
  {
    id: "project-1",
    name: "Website launch",
    "client.name": "Northwind",
    status: "active",
    priority: "critical",
    budget: 12_000,
    spent: 9_200,
    progress: 76,
    due_date: "2026-09-18",
    created_at: "2026-07-04",
  },
  {
    id: "project-2",
    name: "Brand audit",
    "client.name": "Northwind",
    status: "planned",
    priority: "medium",
    budget: 4_000,
    spent: 1_100,
    progress: 28,
    due_date: "2026-10-02",
    created_at: "2026-07-22",
  },
  {
    id: "project-3",
    name: "Autumn campaign",
    "client.name": "Contoso Labs",
    status: "active",
    priority: "high",
    budget: 18_500,
    spent: 13_800,
    progress: 64,
    due_date: "2026-10-14",
    created_at: "2026-08-08",
  },
];

const tasks = [
  {
    id: "task-1",
    title: "Approve final homepage copy",
    "project.name": "Website launch",
    assignee: "Maya",
    priority: "critical",
    status: "blocked",
    estimate: 3,
    due_date: "2026-09-08",
  },
  {
    id: "task-2",
    title: "Run accessibility pass",
    "project.name": "Website launch",
    assignee: "Jon",
    priority: "high",
    status: "doing",
    estimate: 6,
    due_date: "2026-09-11",
  },
  {
    id: "task-3",
    title: "Configure production analytics",
    "project.name": "Website launch",
    assignee: "Iris",
    priority: "medium",
    status: "todo",
    estimate: 4,
    due_date: "2026-09-15",
  },
  {
    id: "task-4",
    title: "Inventory brand touchpoints",
    "project.name": "Brand audit",
    assignee: "Maya",
    priority: "medium",
    status: "done",
    estimate: 8,
    due_date: "2026-09-22",
  },
  {
    id: "task-5",
    title: "Review campaign concepts",
    "project.name": "Autumn campaign",
    assignee: "Jon",
    priority: "high",
    status: "doing",
    estimate: 5,
    due_date: "2026-09-24",
  },
  {
    id: "task-6",
    title: "Prepare launch checklist",
    "project.name": "Website launch",
    assignee: "Iris",
    priority: "medium",
    status: "todo",
    estimate: 2,
    due_date: "2026-09-29",
  },
  {
    id: "task-7",
    title: "Confirm media plan",
    "project.name": "Autumn campaign",
    assignee: "Maya",
    priority: "high",
    status: "todo",
    estimate: 7,
    due_date: "2026-10-03",
  },
  {
    id: "task-8",
    title: "Present audit findings",
    "project.name": "Brand audit",
    assignee: "Jon",
    priority: "medium",
    status: "todo",
    estimate: 4,
    due_date: "2026-10-08",
  },
];

const groupedTasks = [
  { id: "status-1", status: "todo", task_count: 8, estimated_hours: 34 },
  { id: "status-2", status: "doing", task_count: 5, estimated_hours: 22 },
  { id: "status-3", status: "blocked", task_count: 2, estimated_hours: 7 },
  { id: "status-4", status: "done", task_count: 12, estimated_hours: 48 },
];

const pipelineStages = [
  { id: "stage-1", status: "Lead", task_count: 48 },
  { id: "stage-2", status: "Qualified", task_count: 31 },
  { id: "stage-3", status: "Proposal", task_count: 18 },
  { id: "stage-4", status: "Won", task_count: 9 },
];

export const previewRows: Record<string, Array<Record<string, unknown>>> = {
  project_portfolio: projects,
  active_projects: projects.filter((project) => project.status === "active"),
  all_tasks: tasks,
  blocked_tasks: tasks.filter((task) => task.status === "blocked"),
  tasks_by_status: groupedTasks,
  pipeline_stages: pipelineStages,
};

export function projectPreview(config: Record<string, unknown>): BlockPreview {
  return { config, rows: previewRows, spec: previewSpec };
}
