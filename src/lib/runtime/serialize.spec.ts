import { describe, expect, it } from "vite-plus/test";
import { applyDefaults } from "./defaults.ts";
import { normalizeSpec, repairLegacyFields } from "./model.ts";
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

  it("normalizes field keys and rejects anonymous, duplicate, or reserved fields", () => {
    expect.hasAssertions();
    const spec = normalizeSpec({
      types: {
        review: {
          fields: [
            { key: " Overall Score ", label: "   ", type: "number" },
            { label: "Judge notes", type: "text" },
          ],
        },
      },
    });
    expect(spec.types[0]?.fields.map((field) => [field.key, field.label])).toEqual([
      ["overall_score", "Overall Score"],
      ["judge_notes", "Judge notes"],
    ]);
    expect(() =>
      normalizeSpec({ types: { review: { fields: [{ key: " ", label: " ", type: "text" }] } } }),
    ).toThrow("Field needs a non-empty key or label");
    expect(() =>
      normalizeSpec({ types: { review: { fields: [{ key: "id", type: "text" }] } } }),
    ).toThrow('Field key "id" is reserved');
    expect(() =>
      normalizeSpec({
        types: {
          review: {
            fields: [
              { key: "Overall score", type: "number" },
              { key: "overall_score", type: "number" },
            ],
          },
        },
      }),
    ).toThrow('Duplicate field key "overall_score"');
  });

  it("repairs malformed persisted fields and their generated references", () => {
    expect.hasAssertions();
    const legacy = applyDefaults(
      normalizeSpec({ types: { review: { fields: { score: "number" } } } }),
    );
    legacy.types[0]!.fields[0]!.key = " ";
    legacy.types[0]!.fields[0]!.label = " ";
    for (const form of legacy.forms) form.fields = [" "];
    for (const view of legacy.views) view.fields = [" "];
    const repaired = repairLegacyFields(legacy);
    expect(repaired.types[0]?.fields[0]).toMatchObject({ key: "field", label: "Field" });
    expect(repaired.forms.every((form) => form.fields[0] === "field")).toBe(true);
    expect(repaired.views.every((view) => view.fields[0] === "field")).toBe(true);
  });
});
