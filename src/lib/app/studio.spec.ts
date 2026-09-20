import { describe, expect, it } from "vite-plus/test";
import { emptySpec } from "$lib/framework/bootstrap.ts";
import { editorContextFromSpec } from "@jthum/framework/svelte/authoring/adapters";
describe("Studio host boundary", () => {
  it("does not expose platform, persistence or session state", () => {
    const context = editorContextFromSpec(emptySpec("test", "Test"));
    expect(Object.keys(context)).toEqual(["collections", "views", "forms", "rules"]);
    expect(context).toEqual({ collections: [], views: [], forms: [], rules: [] });
  });
  it("supports the initial loading state", () => {
    expect(editorContextFromSpec(emptySpec("empty", "Empty"))).toEqual({
      collections: [],
      views: [],
      forms: [],
      rules: [],
    });
  });
});
