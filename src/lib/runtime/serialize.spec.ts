import { describe, expect, it } from "vite-plus/test";
import { authoredSpec, effectiveSpec } from "./defaults.ts";
import { normalizeSpec } from "./model.ts";
import { authoringSpec, sharedTypeDependencies } from "./serialize.ts";

describe("authoring spec export", () => {
  it("derives stable defaults without changing the authored spec", () => {
    const authored = normalizeSpec({ types: { note: { fields: { title: "text" } } } });
    const first = effectiveSpec(authored);
    const second = effectiveSpec(authored);

    expect(authored.views).toEqual([]);
    expect(authored.forms).toEqual([]);
    expect(authored.pages).toEqual([]);
    expect(first.views[0]?.id).toBe(second.views[0]?.id);
    expect(first.forms.map((form) => form.id)).toEqual(second.forms.map((form) => form.id));
    expect(first.pages[0]?.id).toBe(second.pages[0]?.id);
    expect(authoredSpec(first)).toEqual(authored);
  });

  it("refreshes derived fields when an authored type changes", () => {
    const authored = normalizeSpec({ types: { note: { fields: { title: "text" } } } });
    const initial = effectiveSpec(authored);
    const changed = normalizeSpec(
      {
        ...authored,
        types: {
          note: {
            ...authored.types[0],
            fields: [...authored.types[0]!.fields, { key: "summary", type: "text" }],
          },
        },
      },
      authored,
    );
    const refreshed = effectiveSpec(changed);

    expect(initial.views[0]?.fields).toEqual(["title"]);
    expect(refreshed.views[0]?.fields).toEqual(["title", "summary"]);
    expect(refreshed.forms.find((form) => form.mode === "create")?.fields).toEqual([
      "title",
      "summary",
    ]);
  });

  it("reports shared types that an app export depends on", () => {
    const shared = normalizeSpec({
      types: {
        organisation: { expose: true, fields: { name: "text" } },
        person: { expose: true, fields: { name: "text" } },
      },
    }).types;
    const app = normalizeSpec({
      types: {
        submission: {
          fields: { organisation: { type: "reference", target: "organisation" } },
        },
      },
    });
    expect(sharedTypeDependencies(app, shared).map((type) => type.key)).toEqual(["organisation"]);
  });

  it("includes shared types referenced by standalone form inputs", () => {
    const shared = normalizeSpec({
      types: { organisation: { expose: true, fields: { name: "text" } } },
    }).types;
    const app = normalizeSpec({
      forms: {
        enquiry: {
          mode: "standalone",
          inputs: { organisation: { type: "reference", target: "organisation" } },
        },
      },
    });

    expect(sharedTypeDependencies(app, shared).map((type) => type.key)).toEqual(["organisation"]);
  });

  it("omits generated default forms, views, and pages", () => {
    expect.hasAssertions();
    const spec = effectiveSpec(normalizeSpec({ types: { note: { fields: { title: "text" } } } }));
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
    const spec = effectiveSpec(normalizeSpec({ types: { note: { fields: { title: "text" } } } }));
    const create = spec.forms.find((form) => form.key === "note_create");
    expect(create).toBeTruthy();
    create!.implicit = false;
    const authored = authoringSpec(spec);
    expect(Object.keys(authored.forms as object)).toContain("note_create");
  });

  it("preserves field presentation metadata in authored exports", () => {
    const spec = normalizeSpec({
      types: {
        submission: {
          fields: {
            stage: {
              type: "enum",
              values: ["submitted", "winner", "rejected"],
              presentation: "badge",
              value_semantics: {
                submitted: "neutral",
                winner: "success",
                rejected: "danger",
              },
            },
            score: { type: "number", presentation: "rating", max: 5 },
          },
        },
      },
    });
    const authored = authoringSpec(spec) as {
      types: { submission: { fields: Record<string, Record<string, unknown>> } };
    };
    expect(authored.types.submission.fields.stage).toMatchObject({
      presentation: "badge",
      value_semantics: { submitted: "neutral", winner: "success", rejected: "danger" },
    });
    expect(authored.types.submission.fields.score).toMatchObject({
      presentation: "rating",
      variant: "segments",
      max: 5,
    });
  });

  it("preserves explicit collection labels in authored exports", () => {
    const spec = normalizeSpec({
      types: { person: { label: "Person", collection_label: "People", fields: {} } },
    });
    const authored = authoringSpec(spec) as {
      types: { person: { label: string; collection_label?: string } };
    };
    expect(authored.types.person).toMatchObject({
      label: "Person",
      collection_label: "People",
    });
  });

  it("round-trips standalone form-owned inputs", () => {
    const spec = normalizeSpec({
      forms: {
        contact_us: {
          mode: "standalone",
          submit: {
            success: { title: "Thanks", description: "We will be in touch." },
          },
          inputs: {
            name: { type: "text", required: true },
            email: { type: "text", format: "email" },
          },
        },
      },
    });
    const authored = authoringSpec(spec) as {
      forms: {
        contact_us: {
          type?: string;
          inputs: Record<string, Record<string, unknown>>;
          submit?: { success?: { title?: string; description?: string } };
        };
      };
    };

    expect(spec.forms[0]).toMatchObject({
      mode: "standalone",
      inputs: [
        { key: "name", required: true },
        { key: "email", format: "email" },
      ],
    });
    expect(authored.forms.contact_us.type).toBeUndefined();
    expect(authored.forms.contact_us.inputs.email).toMatchObject({ type: "text", format: "email" });
    expect(authored.forms.contact_us.submit).toEqual({
      success: { title: "Thanks", description: "We will be in touch." },
    });
  });

  it("rejects workflow behavior embedded in forms", () => {
    expect(() =>
      normalizeSpec({
        forms: {
          contact_us: {
            mode: "standalone",
            inputs: { name: { type: "text" } },
            submit: { workflow: "capture_contact" },
          } as never,
        },
      }),
    ).toThrow('Unknown form submit property "workflow"');
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
});
