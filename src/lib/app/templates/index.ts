import type { CollectionDefinition, Spec } from "@jthum/framework/spec";
import { Catalog, type CatalogSource } from "@jthum/framework/catalog";
import data from "./data.json";

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

export const officialAppTemplateSource: CatalogSource<AppTemplate> = {
  key: "official",
  label: "Official",
  description: "Starter Apps designed and maintained by builder.run.",
  categories: templateCategories,
  entries: data as unknown as readonly AppTemplate[],
};

export const appTemplateSources: readonly CatalogSource<AppTemplate>[] = [
  officialAppTemplateSource,
];
export const appTemplateCatalog = new Catalog(appTemplateSources);
export const appTemplates = appTemplateCatalog.list().items.map(({ entry }) => entry);
