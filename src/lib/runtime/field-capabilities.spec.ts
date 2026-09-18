import { describe, expect, it } from "vite-plus/test";
import {
  FIELD_CAPABILITIES,
  FIELD_FORMATS,
  FIELD_KINDS,
  FIELD_PRESENTATIONS,
  fieldWidgetFor,
  supportsFieldFormat,
  supportsFieldPresentation,
  prepareFormField,
} from "@jthum/framework/svelte/studio";

describe("Framework field affordances", () => {
  it("owns every public kind, format and presentation exactly once", () => {
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
  it("resolves widgets and compatible formats", () => {
    expect(fieldWidgetFor("text", "textarea")).toBe("textarea");
    expect(fieldWidgetFor("number", "rating")).toBe("rating");
    expect(supportsFieldFormat("number", "currency")).toBe(true);
    expect(supportsFieldFormat("text", "currency")).toBe(false);
    expect(supportsFieldPresentation("enum", "badge")).toBe(true);
  });
  it("does not allow numeric validation on text Fields", () => {
    expect(FIELD_CAPABILITIES.text.validation).not.toContain("min");
    expect(FIELD_CAPABILITIES.text.validation).toContain("min_length");
    expect(
      prepareFormField("title", { type: "text", validation: { min_length: 1 } }).validation,
    ).toMatchObject({ min_length: 1 });
  });
});
