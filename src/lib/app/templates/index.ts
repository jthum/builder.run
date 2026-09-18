import type { CollectionDefinition, Spec } from "@jthum/framework/spec";
import data from "./data.json";

export interface AppTemplate {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly category: (typeof templateCategories)[number]["key"];
  readonly spec: Spec;
  readonly sharedCollections: readonly CollectionDefinition[];
  readonly records?: readonly {
    readonly type: string;
    readonly as?: string;
    readonly values: Record<string, unknown>;
  }[];
}
export const appTemplates = data as unknown as readonly AppTemplate[];
export const templateCategories = [
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
] as const;
