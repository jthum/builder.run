import { createId } from "./ids.ts";
import { normalizeSpec, type AppSpec, type TypeDef } from "./model.ts";

export interface SampleApp {
  key: string;
  label: string;
  description: string;
  spec: AppSpec;
}

export function directoryTypes(): TypeDef[] {
  return normalizeSpec({
    key: "directory",
    label: "Directory",
    stores: { directory: { kind: "shared", label: "Directory" } },
    types: {
      organisation: {
        store: "directory",
        label: "Organisation",
        fields: {
          name: { type: "text", required: true },
          email: "text",
          website: "text",
        },
      },
      contact: {
        store: "directory",
        label: "Contact",
        fields: {
          name: { type: "text", required: true },
          email: "text",
          organisation: { type: "reference", target: "directory.organisation" },
        },
      },
    },
  }).types;
}

export const sampleApps: SampleApp[] = [
  {
    key: "project_tracker",
    label: "Project tracker",
    description: "Clients, projects, statuses, and a complete-project flow.",
    spec: normalizeSpec({
      key: "project_tracker",
      label: "Project tracker",
      types: {
        project: {
          fields: {
            name: { type: "text", required: true },
            client: { type: "reference", target: "directory.organisation" },
            status: {
              type: "enum",
              values: ["planned", "active", "complete"],
              default: "planned",
            },
            budget: "number",
            due_date: "date",
          },
        },
      },
      views: {
        active_projects: {
          source: "project",
          fields: ["name", "client.name", "due_date", "status"],
          where: { status: "active" },
          order_by: { due_date: "asc" },
        },
      },
      flows: {
        complete_project: {
          input: { project: "ref(project)" },
          when: "project.status != complete",
          expose: ["ui", "agent"],
          steps: [{ set: { "project.status": "complete" } }],
        },
      },
    }),
  },
  {
    key: "expense_approval",
    label: "Expense approval",
    description: "Guarded status changes and a triggered paid-date stamp.",
    spec: normalizeSpec({
      key: "expense_approval",
      label: "Expense approval",
      types: {
        expense: {
          fields: {
            title: { type: "text", required: true },
            amount: { type: "number", required: true },
            status: {
              type: "enum",
              values: ["draft", "submitted", "approved", "rejected", "paid"],
              default: "draft",
            },
            paid_at: "date",
          },
        },
      },
      flows: {
        submit_expense: {
          input: { expense: "ref(expense)" },
          when: "expense.status == draft",
          expose: ["ui", "agent"],
          steps: [{ set: { "expense.status": "submitted" } }],
        },
        approve_expense: {
          input: { expense: "ref(expense)" },
          when: "expense.status == submitted",
          expose: ["ui", "agent"],
          steps: [{ set: { "expense.status": "approved" } }],
        },
        mark_paid: {
          input: { expense: "ref(expense)" },
          expose: ["ui", "agent"],
          steps: [{ set: { "expense.status": "paid" } }],
        },
        record_paid_date: {
          trigger: { when: "expense.status.changed" },
          when: "expense.status == paid",
          steps: [{ set: { "expense.paid_at": "now" } }],
        },
      },
    }),
  },
  {
    key: "freelance_crm",
    label: "Freelance CRM",
    description: "Clients, projects, invoices, views, and a paid-date automation.",
    spec: normalizeSpec({
      key: "freelance_crm",
      label: "Freelance CRM",
      types: {
        project: {
          fields: {
            name: { type: "text", required: true },
            client: { type: "reference", target: "directory.organisation" },
            status: {
              type: "enum",
              values: ["planned", "active", "completed"],
              default: "planned",
            },
            budget: "number",
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
            },
            paid_at: "date",
          },
        },
      },
      views: {
        active_projects: {
          source: "project",
          fields: ["name", "client.name", "status", "budget"],
          where: { status: "active" },
        },
        unpaid_invoices: {
          source: "invoice",
          fields: ["number", "project.name", "amount", "status"],
          where: { status: "sent" },
        },
      },
      flows: {
        mark_invoice_paid: {
          input: { invoice: "ref(invoice)" },
          expose: ["ui", "agent"],
          steps: [{ set: { "invoice.status": "paid" } }],
        },
        record_paid_date: {
          trigger: { when: "invoice.status.changed" },
          when: "invoice.status == paid",
          steps: [{ set: { "invoice.paid_at": "now" } }],
        },
      },
    }),
  },
];

export function newWorkspaceSpec(key: string, label: string): AppSpec {
  return normalizeSpec({
    key,
    label,
    stores: {
      directory: { id: createId("sto"), kind: "shared", label: "Directory" },
      local: { id: createId("sto"), kind: "workspace", label: "Workspace" },
    },
  });
}
