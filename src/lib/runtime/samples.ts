import { slugify } from "./ids.ts";
import { normalizeSpec, type AppSpec, type TypeDef } from "./model.ts";

export interface SampleRecord {
  type: string;
  as?: string;
  values: Record<string, unknown>;
}

export type TemplateCategory = "crm" | "projects" | "finance";

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
  { key: "finance", label: "Finance" },
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
    description: "Keep projects moving — from planned to done.",
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
    records: [
      {
        type: "organisation",
        as: "northwind",
        values: { name: "Northwind", email: "hello@northwind.test" },
      },
      {
        type: "project",
        values: {
          name: "Website launch",
          client: "$northwind",
          status: "active",
          budget: 12000,
          due_date: "2026-09-18",
        },
      },
      {
        type: "project",
        values: {
          name: "Brand audit",
          client: "$northwind",
          status: "planned",
          budget: 4000,
          due_date: "2026-10-02",
        },
      },
      {
        type: "project",
        values: {
          name: "Q2 campaign",
          client: "$northwind",
          status: "complete",
          budget: 6500,
          due_date: "2026-06-30",
        },
      },
    ],
  },
  {
    key: "expense_approval",
    label: "Expense approval",
    description: "Submit, approve, and mark expenses paid.",
    category: "finance",
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
    records: [
      { type: "expense", values: { title: "Train to Manchester", amount: 86, status: "draft" } },
      { type: "expense", values: { title: "Design software", amount: 320, status: "submitted" } },
      { type: "expense", values: { title: "Client lunch", amount: 54, status: "approved" } },
      { type: "expense", values: { title: "Conference ticket", amount: 210, status: "paid" } },
    ],
  },
  {
    key: "freelance_crm",
    label: "Freelance CRM",
    description: "Clients, projects, and invoices — unpaid work in one place.",
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
        type: "contact",
        values: { name: "Jane Cole", email: "jane@acme.test", organisation: "$acme" },
      },
      {
        type: "project",
        as: "web",
        values: { name: "Website redesign", client: "$acme", status: "active", budget: 8000 },
      },
      {
        type: "project",
        as: "brand",
        values: { name: "Brand refresh", client: "$bright", status: "planned", budget: 2500 },
      },
      {
        type: "invoice",
        values: { number: "INV-104", project: "$web", amount: 8000, status: "sent" },
      },
      {
        type: "invoice",
        values: { number: "INV-103", project: "$brand", amount: 1200, status: "paid" },
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
