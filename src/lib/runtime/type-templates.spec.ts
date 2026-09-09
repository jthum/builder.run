import { describe, expect, it } from "vite-plus/test";
import { uniqueKey } from "./ids.ts";
import { resolveTemplateFields, typeDraftFromTemplate, typeTemplates } from "./type-templates.ts";
import type { TypeDef } from "./model.ts";

describe("type templates", () => {
  const organisation = {
    id: "B000000000000002",
    key: "organisation",
    label: "Organisation",
    store: "local",
    expose: true,
    fields: [],
  } as TypeDef;
  const project = {
    id: "B000000000000003",
    key: "project",
    label: "Project",
    store: "local",
    fields: [],
  } as TypeDef;

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
    expect(draft.store).toBe("local");
    expect(draft.fields?.some((field) => field.key === "organisation")).toBe(true);
    expect(uniqueKey("person", ["person", "person_2"])).toBe("person_3");
  });
});
