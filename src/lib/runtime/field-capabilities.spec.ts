import { describe, expect, it } from "vite-plus/test";
import {
  FIELD_CAPABILITIES,
  FIELD_FORMATS,
  FIELD_KINDS,
  FIELD_PRESENTATIONS,
  fieldWidgetFor,
  supportsFieldFormat,
  supportsFieldPresentation,
} from "./field-capabilities.ts";
import { normalizeSpec } from "./model.ts";

describe("field capabilities", () => {
  it("owns every public kind, format, and presentation exactly once", () => {
    expect(Object.keys(FIELD_CAPABILITIES)).toEqual(FIELD_KINDS);
    expect(
      FIELD_KINDS.flatMap((kind) => FIELD_CAPABILITIES[kind].formats.map(({ value }) => value)),
    ).toEqual(FIELD_FORMATS);
    expect(
      FIELD_KINDS.flatMap((kind) =>
        FIELD_CAPABILITIES[kind].presentations.map(({ value }) => value),
      ),
    ).toEqual(FIELD_PRESENTATIONS);
  });

  it("resolves widgets and compatibility from the catalogue", () => {
    expect(fieldWidgetFor("text")).toBe("text");
    expect(fieldWidgetFor("text", "textarea")).toBe("textarea");
    expect(fieldWidgetFor("number", "rating")).toBe("rating");
    expect(supportsFieldFormat("number", "currency")).toBe(true);
    expect(supportsFieldFormat("text", "currency")).toBe(false);
    expect(supportsFieldPresentation("enum", "badge")).toBe(true);
    expect(supportsFieldPresentation("date", "badge")).toBe(false);
  });

  it("rejects capabilities that do not belong to the field kind", () => {
    expect(() =>
      normalizeSpec({
        types: { task: { fields: { due: { type: "date", format: "currency" } } } },
      }),
    ).toThrow('Format "currency" is not supported by date fields');
    expect(() =>
      normalizeSpec({
        types: { task: { fields: { due: { type: "date", presentation: "badge" } } } },
      }),
    ).toThrow('Presentation "badge" is not supported by date fields');
    expect(() =>
      normalizeSpec({
        types: { task: { fields: { due: { type: "date", validation: { min: 1 } } } } },
      }),
    ).toThrow('Validation rule "min" is not supported by date fields');
    expect(() =>
      normalizeSpec({
        types: { task: { fields: { title: { type: "text", field_type: "text" } as never } } },
      }),
    ).toThrow('Unknown field property "field_type"');
  });

  it("ignores empty validation controls for other field kinds", () => {
    const spec = normalizeSpec({
      types: {
        task: {
          fields: {
            title: {
              type: "text",
              validation: {
                min: undefined,
                max: undefined,
                min_length: undefined,
                max_length: undefined,
                pattern: undefined,
                message: undefined,
              },
            },
          },
        },
      },
    });
    expect(spec.types[0]?.fields[0]?.validation).toBeUndefined();
  });

  it("rejects malformed and circular field conditions", () => {
    expect(() =>
      normalizeSpec({
        types: {
          task: {
            fields: {
              kind: { type: "text" },
              detail: {
                type: "text",
                visible_when: { field: "kind", op: "unknown", value: "special" } as never,
              },
            },
          },
        },
      }),
    ).toThrow('Unknown field condition operator "unknown"');
    expect(() =>
      normalizeSpec({
        types: {
          task: {
            fields: {
              first: { type: "text", visible_when: { field: "second", value: "yes" } },
              second: { type: "text", visible_when: { field: "first", value: "yes" } },
            },
          },
        },
      }),
    ).toThrow("contain a cycle");
  });
});
