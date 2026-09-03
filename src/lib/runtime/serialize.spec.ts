import { describe, expect, it } from "vite-plus/test";
import { applyDefaults } from "./defaults.ts";
import { normalizeSpec } from "./model.ts";
import { authoringSpec } from "./serialize.ts";

describe("authoring spec export", () => {
  it("omits generated default forms, views, and pages", () => {
    expect.hasAssertions();
    const spec = applyDefaults(normalizeSpec({ types: { note: { fields: { title: "text" } } } }));
    expect(spec.forms.length).toBeGreaterThan(0);
    expect(spec.views.length).toBeGreaterThan(0);
    expect(spec.pages.length).toBeGreaterThan(0);
    const authored = authoringSpec(spec);
    expect(authored.forms).toEqual({});
    expect(authored.views).toEqual({});
    expect(authored.pages).toEqual({});
    expect(Object.keys(authored.types as object)).toEqual(["note"]);
  });

  it("keeps forms that are no longer implicit", () => {
    expect.hasAssertions();
    const spec = applyDefaults(normalizeSpec({ types: { note: { fields: { title: "text" } } } }));
    const create = spec.forms.find((form) => form.key === "note_create");
    expect(create).toBeTruthy();
    create!.implicit = false;
    const authored = authoringSpec(spec);
    expect(Object.keys(authored.forms as object)).toContain("note_create");
  });
});
