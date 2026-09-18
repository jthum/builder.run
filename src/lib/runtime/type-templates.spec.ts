import { describe, expect, it } from "vite-plus/test";
import { uniqueKey } from "./ids.ts";
import {
  resolveTemplateFields,
  typeDraftFromTemplate,
  typeTemplateCatalog,
  typeTemplates,
} from "./type-templates.ts";
import type { CollectionDraft } from "$lib/blocks/presentation.ts";

describe("type templates", () => {
  const organisation = {
    id: "B000000000000002",
    key: "organisation",
    label: "Organisation",
    expose: true,
    fields: [],
  } as CollectionDraft;

  it("exposes Field recipes through the same catalog discovery contract", () => {
    const money = typeTemplateCatalog.list({ category: "money", search: "approval" });

    expect(money.items.map(({ source, entry }) => [source.key, entry.key])).toEqual([
      ["official", "expense"],
    ]);
  });
  const project = {
    id: "B000000000000003",
    key: "project",
    label: "Project",
    fields: [],
  } as CollectionDraft;

  it("keeps enums and drops links when the target type is missing", () => {
    expect.hasAssertions();
    const invoice = typeTemplates.find((item) => item.key === "invoice");
    expect(invoice).toBeTruthy();
    const withoutProject = resolveTemplateFields(invoice!, [organisation]);
    expect(withoutProject.map((field) => field.key)).toEqual([
      "number",
      "amount",
      "status",
      "issued_on",
    ]);
    expect(withoutProject.find((field) => field.key === "status")?.values).toContain("paid");
    const withProject = resolveTemplateFields(invoice!, [organisation, project]);
    expect(withProject.some((field) => field.key === "project" && field.target === "project")).toBe(
      true,
    );
  });

  it("builds a unique local type draft from a template", () => {
    expect.hasAssertions();
    const person = typeTemplates.find((item) => item.key === "person");
    const draft = typeDraftFromTemplate("Person", person, [organisation]);
    expect(draft.key).toBe("person");
    expect(draft.fields?.some((field) => field.key === "organisation")).toBe(true);
    expect(uniqueKey("person", ["person", "person_2"])).toBe("person_3");
  });
});
