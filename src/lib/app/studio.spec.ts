import { describe, expect, it } from "vite-plus/test";
import { normalizeSpec } from "$lib/runtime/model.ts";
import { editorContext } from "./studio.ts";
describe("Studio host boundary", () => {
  it("does not expose platform, persistence or session state", () => {
    const context = editorContext(normalizeSpec({ label: "Test" }));
    expect(Object.keys(context)).toEqual(["collections", "views", "forms", "rules"]);
    expect(context).toEqual({ collections: [], views: [], forms: [], rules: [] });
  });
  it("supports the initial loading state", () => {
    expect(editorContext(undefined)).toEqual({ collections: [], views: [], forms: [], rules: [] });
  });
});
