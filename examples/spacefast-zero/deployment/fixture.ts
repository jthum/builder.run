import { createEmptySpec, type Spec } from "@jthum/framework/spec";

/** Same definition identities across releases; release two renames a key and adds a Field. */
export function fixture(revision: 1 | 2): Spec {
  return {
    ...createEmptySpec({ id: "deployment_spec", key: "task_board", label: "Task board" }),
    collections: [
      {
        id: "deployment_tasks",
        key: "task",
        label: "Task",
        titleFieldId: "task_title",
        fields: [
          {
            id: "task_title",
            key: revision === 1 ? "title" : "name",
            label: "Name",
            type: "text",
            required: true,
          },
          {
            id: "task_priority",
            key: "priority",
            label: "Priority",
            type: "number",
            required: true,
          },
          { id: "task_open", key: "open", label: "Open", type: "boolean" },
          { id: "task_details", key: "details", label: "Details", type: "json" },
          ...(revision === 2
            ? [{ id: "task_notes", key: "notes", label: "Notes", type: "text" as const }]
            : []),
        ],
      },
    ],
    views: [
      {
        id: "deployment_ranked",
        key: "ranked_tasks",
        label: "Ranked tasks",
        source: "task",
        query: {
          filter: { path: ["task_open"], operator: "eq", value: true },
          sort: [{ path: ["task_priority"], direction: "desc" }],
        },
      },
      {
        id: "deployment_priority",
        key: "priority",
        label: "Priority",
        source: "task",
        query: { sort: [{ path: ["task_priority"], direction: "desc" }] },
      },
    ],
    forms: [
      {
        id: "new_task_form",
        key: "new_task",
        label: "New task",
        mode: "create",
        collectionId: "deployment_tasks",
        fieldIds: ["task_title", "task_priority", "task_open"],
      },
    ],
    rules: [
      {
        id: "review_rule",
        key: "review",
        label: "Review",
        enabled: true,
        steps: [
          {
            id: "review_wait",
            wait: {
              request: {
                label: "Review",
                fields: [
                  {
                    id: "review_answer",
                    key: "answer",
                    label: "Answer",
                    type: "text",
                    required: true,
                  },
                ],
              },
              as: "response",
            },
          },
        ],
        result: { $ref: "vars.response" },
      },
      {
        id: "echo_rule",
        key: "echo",
        label: "Echo",
        enabled: true,
        steps: [{ id: "echo_value", compute: { assign: { message: "Ready" } } }],
        result: { $ref: "vars.message" },
      },
    ],
  };
}
