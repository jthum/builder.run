import { describe, expect, it } from "vite-plus/test";
import { recordHref, webHref } from "./links.ts";
import type { ViewDraft } from "./presentation.ts";

describe("block links", () => {
  it.each([
    "/p/overview",
    "/v/project_portfolio",
    "/t/task/new",
    "https://example.com/guide",
    "http://localhost:5173/p/home",
  ])("accepts %s", (href) => {
    expect(webHref(href)).toBe(href);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,hello",
    "file:///etc/passwd",
    "//other.test/page",
    "/\\other.test",
    "https://example.com/\npath",
    "/a\tb",
    "tasks",
    "",
    null,
    {},
  ])("rejects unsafe or unsupported destinations: %s", (href) => {
    expect(webHref(href)).toBeUndefined();
  });

  it("encodes explicit record identities and never links an aggregate row", () => {
    const view: ViewDraft = {
      id: "tasks",
      key: "tasks",
      label: "Tasks",
      source: "task/list",
      fields: [],
    };
    expect(recordHref(view, { id: "record/1?#" })).toBe("/t/task%2Flist/record%2F1%3F%23");
    expect(recordHref(view, {})).toBeUndefined();
    expect(recordHref(view, { id: "" })).toBeUndefined();
    expect(recordHref({ ...view, group_by: "status" }, { id: "computed" })).toBeUndefined();
  });
});
