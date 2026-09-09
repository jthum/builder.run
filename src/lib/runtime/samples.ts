import { slugify } from "./ids.ts";
import { normalizeSpec, type AppSpec, type TypeDef } from "./model.ts";

export interface SampleRecord {
  type: string;
  as?: string;
  values: Record<string, unknown>;
}

export type TemplateCategory =
  | "crm"
  | "projects"
  | "sales"
  | "marketing"
  | "operations"
  | "finance"
  | "people"
  | "support"
  | "inventory"
  | "events"
  | "education"
  | "personal";

export interface SampleApp {
  key: string;
  label: string;
  description: string;
  category: TemplateCategory;
  spec: AppSpec;
  exposedTypes?: TypeDef[];
  records?: SampleRecord[];
}

export const templateCategories: Array<{ key: TemplateCategory; label: string }> = [
  { key: "crm", label: "CRM" },
  { key: "projects", label: "Projects" },
  { key: "sales", label: "Sales" },
  { key: "marketing", label: "Marketing" },
  { key: "operations", label: "Operations" },
  { key: "finance", label: "Finance" },
  { key: "people", label: "People & HR" },
  { key: "support", label: "Customer support" },
  { key: "inventory", label: "Inventory" },
  { key: "events", label: "Events" },
  { key: "education", label: "Education" },
  { key: "personal", label: "Personal" },
];

/** Template content — not kernel types. Installed on the root space with expose. */
export function peopleSharedTypes(): TypeDef[] {
  return normalizeSpec({
    key: "space",
    label: "Space",
    types: {
      organisation: {
        expose: true,
        label: "Organisation",
        fields: {
          name: { type: "text", required: true },
          email: "text",
          website: "text",
        },
      },
      contact: {
        expose: true,
        label: "Contact",
        fields: {
          name: { type: "text", required: true },
          email: "text",
          organisation: { type: "reference", target: "organisation" },
        },
      },
    },
  }).types;
}

export const sampleApps: SampleApp[] = [
  {
    key: "project_tracker",
    label: "Project tracker",
    description: "Plan client work, track delivery, and spot blocked tasks early.",
    category: "projects",
    exposedTypes: peopleSharedTypes().filter((type) => type.key === "organisation"),
    spec: normalizeSpec({
      key: "project_tracker",
      label: "Project tracker",
      types: {
        project: {
          fields: {
            name: { type: "text", required: true },
            client: { type: "reference", target: "organisation" },
            status: {
              type: "enum",
              values: ["planned", "active", "complete"],
              default: "planned",
              presentation: "badge",
              value_semantics: { planned: "info", active: "success", complete: "neutral" },
            },
            priority: {
              type: "enum",
              values: ["low", "medium", "high", "critical"],
              default: "medium",
              presentation: "badge",
              value_semantics: {
                low: "neutral",
                medium: "info",
                high: "warning",
                critical: "danger",
              },
            },
            budget: "number",
            due_date: "date",
          },
        },
        task: {
          fields: {
            title: { type: "text", required: true },
            project: { type: "reference", target: "project", required: true },
            status: {
              type: "enum",
              values: ["todo", "doing", "blocked", "done"],
              default: "todo",
              presentation: "badge",
              value_semantics: {
                todo: "neutral",
                doing: "info",
                blocked: "danger",
                done: "success",
              },
            },
            priority: {
              type: "enum",
              values: ["low", "medium", "high", "critical"],
              default: "medium",
              presentation: "badge",
              value_semantics: {
                low: "neutral",
                medium: "info",
                high: "warning",
                critical: "danger",
              },
            },
            assignee: "text",
            estimate: "number",
            due_date: "date",
          },
        },
      },
      views: {
        project_portfolio: {
          source: "project",
          fields: ["name", "client.name", "status", "priority", "budget", "due_date"],
          order_by: { due_date: "asc" },
        },
        active_projects: {
          source: "project",
          fields: ["name", "client.name", "priority", "budget", "due_date", "status"],
          where: { status: "active" },
          order_by: { due_date: "asc" },
        },
        all_tasks: {
          source: "task",
          fields: [
            "title",
            "project.name",
            "assignee",
            "priority",
            "status",
            "estimate",
            "due_date",
          ],
          order_by: { due_date: "asc" },
        },
        blocked_tasks: {
          source: "task",
          fields: ["title", "project.name", "assignee", "priority", "due_date", "status"],
          where: { status: "blocked" },
          order_by: { due_date: "asc" },
        },
        tasks_by_status: {
          source: "task",
          group_by: "status",
          measures: {
            task_count: { op: "count" },
            estimated_hours: { op: "sum", field: "estimate" },
          },
          order_by: { task_count: "desc" },
        },
      },
      forms: {
        quick_task: {
          type: "task",
          fields: ["title", "project", "assignee", "priority", "status", "estimate", "due_date"],
          mode: "create",
        },
      },
      workflows: {
        complete_project: {
          input: { project: { record: "project" } },
          expose: ["ui", "agent"],
          steps: [
            {
              gate: {
                predicate: {
                  op: "context.not_equals",
                  path: "vars.project.status",
                  value: "complete",
                },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.project" }, values: { status: "complete" } },
                    },
                  },
                ],
              },
            },
          ],
        },
        complete_task: {
          input: { task: { record: "task" } },
          expose: ["ui", "agent"],
          steps: [
            {
              gate: {
                predicate: { op: "context.not_equals", path: "vars.task.status", value: "done" },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.task" }, values: { status: "done" } },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      pages: {
        home: {
          label: "Delivery overview",
          path: "/",
          icon: "dashboard",
          blocks: [
            {
              kind: "group",
              columns: 1,
              blocks: [
                {
                  kind: "widget",
                  widget: "heading",
                  values: {
                    title: "Delivery overview",
                    description:
                      "A live view of active client work, priorities, and team capacity.",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 3,
              blocks: [
                {
                  kind: "widget",
                  widget: "stat",
                  values: { view: "active_projects", title: "Active projects" },
                },
                {
                  kind: "widget",
                  widget: "stat",
                  values: { view: "blocked_tasks", title: "Blocked tasks" },
                },
                {
                  kind: "widget",
                  widget: "metric",
                  values: {
                    view: "project_portfolio",
                    value: "budget",
                    date: "due_date",
                    title: "Portfolio budget",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 2,
              min_height: "m",
              blocks: [
                {
                  kind: "widget",
                  widget: "donut",
                  values: {
                    view: "tasks_by_status",
                    category: "status",
                    value: "task_count",
                    title: "Work by status",
                  },
                },
                {
                  kind: "widget",
                  widget: "bar",
                  values: {
                    view: "tasks_by_status",
                    category: "status",
                    value: "estimated_hours",
                    title: "Estimated hours",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 1,
              min_height: "m",
              blocks: [
                {
                  kind: "widget",
                  widget: "kanban",
                  values: { view: "all_tasks", field: "status", title: "Delivery board" },
                },
              ],
            },
            {
              kind: "group",
              columns: 1,
              blocks: [
                {
                  kind: "widget",
                  widget: "table",
                  values: { view: "active_projects", title: "Active projects" },
                },
                {
                  kind: "widget",
                  widget: "form",
                  values: { form: "quick_task", title: "Add a task" },
                },
              ],
            },
          ],
        },
      },
    }),
    records: [
      {
        type: "organisation",
        as: "northwind",
        values: { name: "Northwind", email: "hello@northwind.test" },
      },
      {
        type: "organisation",
        as: "contoso",
        values: { name: "Contoso Labs", email: "projects@contoso.test" },
      },
      {
        type: "project",
        as: "launch",
        values: {
          name: "Website launch",
          client: "$northwind",
          status: "active",
          priority: "critical",
          budget: 12000,
          due_date: "2026-09-18",
        },
      },
      {
        type: "project",
        as: "audit",
        values: {
          name: "Brand audit",
          client: "$northwind",
          status: "planned",
          priority: "medium",
          budget: 4000,
          due_date: "2026-10-02",
        },
      },
      {
        type: "project",
        as: "campaign",
        values: {
          name: "Autumn campaign",
          client: "$contoso",
          status: "active",
          priority: "high",
          budget: 18500,
          due_date: "2026-10-14",
        },
      },
      {
        type: "project",
        as: "research",
        values: {
          name: "Customer research",
          client: "$contoso",
          status: "active",
          priority: "medium",
          budget: 7200,
          due_date: "2026-11-06",
        },
      },
      {
        type: "project",
        as: "q2",
        values: {
          name: "Q2 campaign",
          client: "$northwind",
          status: "complete",
          priority: "low",
          budget: 6500,
          due_date: "2026-06-30",
        },
      },
      {
        type: "task",
        values: {
          title: "Approve final homepage copy",
          project: "$launch",
          status: "blocked",
          priority: "critical",
          assignee: "Maya",
          estimate: 3,
          due_date: "2026-09-08",
        },
      },
      {
        type: "task",
        values: {
          title: "Run accessibility pass",
          project: "$launch",
          status: "doing",
          priority: "high",
          assignee: "Jon",
          estimate: 6,
          due_date: "2026-09-11",
        },
      },
      {
        type: "task",
        values: {
          title: "Configure production analytics",
          project: "$launch",
          status: "todo",
          priority: "medium",
          assignee: "Iris",
          estimate: 4,
          due_date: "2026-09-15",
        },
      },
      {
        type: "task",
        values: {
          title: "Inventory brand touchpoints",
          project: "$audit",
          status: "doing",
          priority: "medium",
          assignee: "Maya",
          estimate: 8,
          due_date: "2026-09-22",
        },
      },
      {
        type: "task",
        values: {
          title: "Interview sales team",
          project: "$audit",
          status: "todo",
          priority: "low",
          assignee: "Sam",
          estimate: 5,
          due_date: "2026-09-25",
        },
      },
      {
        type: "task",
        values: {
          title: "Confirm media budget",
          project: "$campaign",
          status: "blocked",
          priority: "high",
          assignee: "Iris",
          estimate: 2,
          due_date: "2026-09-10",
        },
      },
      {
        type: "task",
        values: {
          title: "Build campaign landing page",
          project: "$campaign",
          status: "doing",
          priority: "high",
          assignee: "Jon",
          estimate: 16,
          due_date: "2026-09-28",
        },
      },
      {
        type: "task",
        values: {
          title: "Prepare launch creative",
          project: "$campaign",
          status: "todo",
          priority: "medium",
          assignee: "Maya",
          estimate: 12,
          due_date: "2026-10-05",
        },
      },
      {
        type: "task",
        values: {
          title: "Synthesize interview notes",
          project: "$research",
          status: "todo",
          priority: "medium",
          assignee: "Sam",
          estimate: 10,
          due_date: "2026-10-20",
        },
      },
      {
        type: "task",
        values: {
          title: "Recruit research panel",
          project: "$research",
          status: "done",
          priority: "medium",
          assignee: "Sam",
          estimate: 7,
          due_date: "2026-09-02",
        },
      },
    ],
  },
  {
    key: "expense_approval",
    label: "Expense approval",
    description: "Submit expenses, review the approval queue, and track spend by category.",
    category: "finance",
    spec: normalizeSpec({
      key: "expense_approval",
      label: "Expense approval",
      types: {
        expense: {
          fields: {
            title: { type: "text", required: true },
            amount: { type: "number", required: true },
            category: {
              type: "enum",
              values: ["travel", "software", "meals", "equipment", "marketing"],
              default: "travel",
            },
            submitter: { type: "text", required: true },
            spent_on: { type: "date", required: true },
            status: {
              type: "enum",
              values: ["draft", "submitted", "approved", "rejected", "paid"],
              default: "draft",
              presentation: "badge",
              value_semantics: {
                draft: "neutral",
                submitted: "info",
                approved: "success",
                rejected: "danger",
                paid: "success",
              },
            },
            notes: "text",
            paid_at: "date",
          },
        },
      },
      views: {
        all_expenses: {
          source: "expense",
          fields: ["title", "submitter", "category", "amount", "spent_on", "status"],
          order_by: { spent_on: "desc" },
        },
        approval_queue: {
          source: "expense",
          fields: ["title", "submitter", "category", "amount", "spent_on", "status"],
          where: { status: "submitted" },
          order_by: { spent_on: "asc" },
        },
        paid_expenses: {
          source: "expense",
          fields: ["title", "category", "amount", "spent_on", "paid_at", "status"],
          where: { status: "paid" },
          order_by: { spent_on: "asc" },
        },
        expenses_by_category: {
          source: "expense",
          group_by: "category",
          measures: {
            expense_count: { op: "count" },
            total_amount: { op: "sum", field: "amount" },
          },
          order_by: { total_amount: "desc" },
        },
        expenses_by_status: {
          source: "expense",
          group_by: "status",
          measures: {
            expense_count: { op: "count" },
            total_amount: { op: "sum", field: "amount" },
          },
          order_by: { total_amount: "desc" },
        },
      },
      forms: {
        submit_expense_form: {
          type: "expense",
          fields: ["title", "amount", "category", "submitter", "spent_on", "notes"],
          mode: "create",
        },
      },
      workflows: {
        submit_expense: {
          input: { expense: { record: "expense" } },
          expose: ["ui", "agent"],
          steps: [
            {
              gate: {
                predicate: { op: "context.equals", path: "vars.expense.status", value: "draft" },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.expense" }, values: { status: "submitted" } },
                    },
                  },
                ],
              },
            },
          ],
        },
        approve_expense: {
          input: { expense: { record: "expense" } },
          expose: ["ui", "agent"],
          steps: [
            {
              gate: {
                predicate: {
                  op: "context.equals",
                  path: "vars.expense.status",
                  value: "submitted",
                },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.expense" }, values: { status: "approved" } },
                    },
                  },
                ],
              },
            },
          ],
        },
        reject_expense: {
          input: { expense: { record: "expense" } },
          expose: ["ui", "agent"],
          steps: [
            {
              gate: {
                predicate: {
                  op: "context.equals",
                  path: "vars.expense.status",
                  value: "submitted",
                },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: { record: { $ref: "vars.expense" }, values: { status: "rejected" } },
                    },
                  },
                ],
              },
            },
          ],
        },
        mark_paid: {
          input: { expense: { record: "expense" } },
          expose: ["ui", "agent"],
          steps: [
            {
              effect: {
                key: "records.set",
                params: { record: { $ref: "vars.expense" }, values: { status: "paid" } },
              },
            },
          ],
        },
        record_paid_date: {
          trigger: { key: "expense.status.changed" },
          steps: [
            {
              gate: {
                predicate: { op: "context.equals", path: "vars.expense.status", value: "paid" },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: {
                        record: { $ref: "vars.expense" },
                        values: { paid_at: { $ref: "meta.now" } },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      pages: {
        home: {
          label: "Spend overview",
          path: "/",
          icon: "money",
          blocks: [
            {
              kind: "group",
              columns: 1,
              blocks: [
                {
                  kind: "widget",
                  widget: "heading",
                  values: {
                    title: "Spend overview",
                    description:
                      "Review incoming requests and understand where the budget is going.",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 3,
              blocks: [
                {
                  kind: "widget",
                  widget: "stat",
                  values: { view: "approval_queue", title: "Awaiting approval" },
                },
                {
                  kind: "widget",
                  widget: "stat",
                  values: { view: "paid_expenses", title: "Paid expenses" },
                },
                {
                  kind: "widget",
                  widget: "metric",
                  values: {
                    view: "all_expenses",
                    value: "amount",
                    date: "spent_on",
                    title: "Total submitted",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 2,
              min_height: "m",
              blocks: [
                {
                  kind: "widget",
                  widget: "donut",
                  values: {
                    view: "expenses_by_status",
                    category: "status",
                    value: "total_amount",
                    title: "Spend by status",
                  },
                },
                {
                  kind: "widget",
                  widget: "bar",
                  values: {
                    view: "expenses_by_category",
                    category: "category",
                    value: "total_amount",
                    title: "Spend by category",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 1,
              blocks: [
                {
                  kind: "widget",
                  widget: "table",
                  values: { view: "approval_queue", title: "Approval queue" },
                },
                {
                  kind: "widget",
                  widget: "form",
                  values: { form: "submit_expense_form", title: "Submit an expense" },
                },
              ],
            },
          ],
        },
      },
    }),
    records: [
      {
        type: "expense",
        values: {
          title: "Train to Manchester",
          amount: 86,
          category: "travel",
          submitter: "Ava Patel",
          spent_on: "2026-09-01",
          status: "draft",
          notes: "Customer workshop",
        },
      },
      {
        type: "expense",
        values: {
          title: "Design software",
          amount: 320,
          category: "software",
          submitter: "Noah Green",
          spent_on: "2026-08-28",
          status: "submitted",
          notes: "Annual team licence",
        },
      },
      {
        type: "expense",
        values: {
          title: "Client lunch",
          amount: 54,
          category: "meals",
          submitter: "Mia Chen",
          spent_on: "2026-08-30",
          status: "approved",
        },
      },
      {
        type: "expense",
        values: {
          title: "Conference ticket",
          amount: 210,
          category: "marketing",
          submitter: "Ava Patel",
          spent_on: "2026-08-12",
          status: "paid",
          paid_at: "2026-08-18",
        },
      },
      {
        type: "expense",
        values: {
          title: "Standing desk",
          amount: 475,
          category: "equipment",
          submitter: "Noah Green",
          spent_on: "2026-08-25",
          status: "submitted",
          notes: "Home office allowance",
        },
      },
      {
        type: "expense",
        values: {
          title: "Airport transfer",
          amount: 62,
          category: "travel",
          submitter: "Mia Chen",
          spent_on: "2026-08-21",
          status: "paid",
          paid_at: "2026-08-27",
        },
      },
      {
        type: "expense",
        values: {
          title: "Team planning lunch",
          amount: 148,
          category: "meals",
          submitter: "Leo Martin",
          spent_on: "2026-08-22",
          status: "submitted",
        },
      },
      {
        type: "expense",
        values: {
          title: "Research database",
          amount: 199,
          category: "software",
          submitter: "Mia Chen",
          spent_on: "2026-08-15",
          status: "rejected",
          notes: "Duplicate subscription",
        },
      },
      {
        type: "expense",
        values: {
          title: "Product demo booth",
          amount: 1250,
          category: "marketing",
          submitter: "Leo Martin",
          spent_on: "2026-07-29",
          status: "approved",
        },
      },
      {
        type: "expense",
        values: {
          title: "Webcam and lighting",
          amount: 184,
          category: "equipment",
          submitter: "Ava Patel",
          spent_on: "2026-07-24",
          status: "paid",
          paid_at: "2026-08-02",
        },
      },
      {
        type: "expense",
        values: {
          title: "Partner dinner",
          amount: 126,
          category: "meals",
          submitter: "Noah Green",
          spent_on: "2026-09-02",
          status: "submitted",
        },
      },
      {
        type: "expense",
        values: {
          title: "Return flight to Berlin",
          amount: 412,
          category: "travel",
          submitter: "Leo Martin",
          spent_on: "2026-07-18",
          status: "paid",
          paid_at: "2026-07-25",
        },
      },
    ],
  },
  {
    key: "freelance_crm",
    label: "Freelance CRM",
    description: "Manage client work, follow project delivery, and keep invoices moving.",
    category: "crm",
    exposedTypes: peopleSharedTypes(),
    spec: normalizeSpec({
      key: "freelance_crm",
      label: "Freelance CRM",
      types: {
        project: {
          fields: {
            name: { type: "text", required: true },
            client: { type: "reference", target: "organisation" },
            status: {
              type: "enum",
              values: ["planned", "active", "paused", "completed"],
              default: "planned",
              presentation: "badge",
              value_semantics: {
                planned: "info",
                active: "success",
                paused: "warning",
                completed: "neutral",
              },
            },
            budget: "number",
            due_date: "date",
          },
        },
        invoice: {
          fields: {
            number: { type: "text", required: true },
            project: { type: "reference", target: "project" },
            amount: { type: "number", required: true },
            status: {
              type: "enum",
              values: ["draft", "sent", "paid", "overdue"],
              default: "draft",
              presentation: "badge",
              value_semantics: {
                draft: "neutral",
                sent: "info",
                paid: "success",
                overdue: "danger",
              },
            },
            issued_on: "date",
            due_date: "date",
            paid_at: "date",
          },
        },
      },
      views: {
        all_projects: {
          source: "project",
          fields: ["name", "client.name", "status", "budget", "due_date"],
          order_by: { due_date: "asc" },
        },
        active_projects: {
          source: "project",
          fields: ["name", "client.name", "status", "budget", "due_date"],
          where: { status: "active" },
          order_by: { due_date: "asc" },
        },
        all_invoices: {
          source: "invoice",
          fields: ["number", "project.name", "amount", "issued_on", "due_date", "status"],
          order_by: { issued_on: "asc" },
        },
        unpaid_invoices: {
          source: "invoice",
          fields: ["number", "project.name", "amount", "issued_on", "due_date", "status"],
          where: { status: "sent" },
          expose: ["status"],
          order_by: { due_date: "asc" },
        },
        overdue_invoices: {
          source: "invoice",
          fields: ["number", "project.name", "amount", "due_date", "status"],
          where: { status: "overdue" },
          order_by: { due_date: "asc" },
        },
        invoice_totals_by_status: {
          source: "invoice",
          group_by: "status",
          measures: {
            invoice_count: { op: "count" },
            total_amount: { op: "sum", field: "amount" },
          },
          order_by: { total_amount: "desc" },
        },
      },
      forms: {
        create_invoice: {
          type: "invoice",
          fields: ["number", "project", "amount", "issued_on", "due_date", "status"],
          mode: "create",
        },
      },
      workflows: {
        mark_invoice_paid: {
          input: { invoice: { record: "invoice" } },
          expose: ["ui", "agent"],
          steps: [
            {
              effect: {
                key: "records.set",
                params: { record: { $ref: "vars.invoice" }, values: { status: "paid" } },
              },
            },
          ],
        },
        record_paid_date: {
          trigger: { key: "invoice.status.changed" },
          steps: [
            {
              gate: {
                predicate: { op: "context.equals", path: "vars.invoice.status", value: "paid" },
                pass: [
                  {
                    effect: {
                      key: "records.set",
                      params: {
                        record: { $ref: "vars.invoice" },
                        values: { paid_at: { $ref: "meta.now" } },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      pages: {
        home: {
          label: "Business overview",
          path: "/",
          icon: "dashboard",
          blocks: [
            {
              kind: "group",
              columns: 1,
              blocks: [
                {
                  kind: "widget",
                  widget: "heading",
                  values: {
                    title: "Business overview",
                    description:
                      "Keep client delivery healthy and see what is outstanding at a glance.",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 3,
              blocks: [
                {
                  kind: "widget",
                  widget: "stat",
                  values: { view: "active_projects", title: "Active projects" },
                },
                {
                  kind: "widget",
                  widget: "stat",
                  values: { view: "overdue_invoices", title: "Overdue invoices" },
                },
                {
                  kind: "widget",
                  widget: "metric",
                  values: {
                    view: "all_invoices",
                    value: "amount",
                    date: "issued_on",
                    title: "Total invoiced",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 2,
              min_height: "m",
              blocks: [
                {
                  kind: "widget",
                  widget: "donut",
                  values: {
                    view: "invoice_totals_by_status",
                    category: "status",
                    value: "total_amount",
                    title: "Invoice mix",
                  },
                },
                {
                  kind: "widget",
                  widget: "line",
                  values: {
                    view: "all_invoices",
                    category: "issued_on",
                    value: "amount",
                    title: "Invoicing over time",
                  },
                },
              ],
            },
            {
              kind: "group",
              columns: 1,
              min_height: "m",
              blocks: [
                {
                  kind: "widget",
                  widget: "kanban",
                  values: { view: "all_projects", field: "status", title: "Project pipeline" },
                },
              ],
            },
            {
              kind: "group",
              columns: 1,
              blocks: [
                {
                  kind: "widget",
                  widget: "table",
                  values: { view: "unpaid_invoices", title: "Awaiting payment" },
                },
                {
                  kind: "widget",
                  widget: "form",
                  values: { form: "create_invoice", title: "Create an invoice" },
                },
              ],
            },
          ],
        },
      },
    }),
    records: [
      {
        type: "organisation",
        as: "acme",
        values: { name: "Acme Ltd", email: "hello@acme.test", website: "https://acme.test" },
      },
      {
        type: "organisation",
        as: "bright",
        values: {
          name: "Brightline Studio",
          email: "hi@brightline.test",
          website: "https://brightline.test",
        },
      },
      {
        type: "organisation",
        as: "harbor",
        values: {
          name: "Harbor Health",
          email: "team@harbor.test",
          website: "https://harbor.test",
        },
      },
      {
        type: "contact",
        values: { name: "Jane Cole", email: "jane@acme.test", organisation: "$acme" },
      },
      {
        type: "contact",
        values: { name: "Eli Brooks", email: "eli@brightline.test", organisation: "$bright" },
      },
      {
        type: "contact",
        values: { name: "Priya Rao", email: "priya@harbor.test", organisation: "$harbor" },
      },
      {
        type: "project",
        as: "web",
        values: {
          name: "Website redesign",
          client: "$acme",
          status: "active",
          budget: 8000,
          due_date: "2026-09-24",
        },
      },
      {
        type: "project",
        as: "brand",
        values: {
          name: "Brand refresh",
          client: "$bright",
          status: "planned",
          budget: 2500,
          due_date: "2026-10-18",
        },
      },
      {
        type: "project",
        as: "portal",
        values: {
          name: "Patient portal research",
          client: "$harbor",
          status: "active",
          budget: 6200,
          due_date: "2026-10-04",
        },
      },
      {
        type: "project",
        as: "launch",
        values: {
          name: "Product launch kit",
          client: "$bright",
          status: "paused",
          budget: 4800,
          due_date: "2026-10-28",
        },
      },
      {
        type: "project",
        as: "annual",
        values: {
          name: "Annual report",
          client: "$acme",
          status: "completed",
          budget: 3900,
          due_date: "2026-07-30",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-104",
          project: "$web",
          amount: 8000,
          status: "sent",
          issued_on: "2026-08-25",
          due_date: "2026-09-24",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-103",
          project: "$brand",
          amount: 1200,
          status: "paid",
          issued_on: "2026-08-10",
          due_date: "2026-08-25",
          paid_at: "2026-08-22",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-102",
          project: "$annual",
          amount: 3900,
          status: "paid",
          issued_on: "2026-07-18",
          due_date: "2026-08-01",
          paid_at: "2026-07-29",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-105",
          project: "$portal",
          amount: 3100,
          status: "sent",
          issued_on: "2026-08-29",
          due_date: "2026-09-12",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-101",
          project: "$web",
          amount: 2400,
          status: "overdue",
          issued_on: "2026-07-22",
          due_date: "2026-08-21",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-106",
          project: "$launch",
          amount: 1600,
          status: "draft",
          issued_on: "2026-09-02",
          due_date: "2026-10-02",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-100",
          project: "$annual",
          amount: 1950,
          status: "paid",
          issued_on: "2026-06-30",
          due_date: "2026-07-14",
          paid_at: "2026-07-12",
        },
      },
      {
        type: "invoice",
        values: {
          number: "INV-099",
          project: "$portal",
          amount: 1550,
          status: "overdue",
          issued_on: "2026-07-05",
          due_date: "2026-08-04",
        },
      },
    ],
  },
];

export function rootSpaceSpec(label: string): AppSpec {
  return normalizeSpec({
    key: slugify(label) || "space",
    label,
    stores: { local: { kind: "local", label: "App" } },
  });
}

export function newAppSpec(key: string, label: string): AppSpec {
  return normalizeSpec({
    key,
    label,
    stores: { local: { kind: "local", label: "App" } },
  });
}
