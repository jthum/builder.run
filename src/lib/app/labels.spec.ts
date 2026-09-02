import { describe, expect, it } from "vite-plus/test";
import { greeting, homeViews, statusDotClass, statusTone } from "./labels.ts";
import type { AppSpec, TypeDef, ViewDef } from "$lib/runtime/model.ts";

describe("status tones", () => {
  it("maps invoice and project statuses to distinct tones", () => {
    expect.hasAssertions();
    expect(statusTone("paid")).toBe("success");
    expect(statusTone("overdue")).toBe("danger");
    expect(statusTone("sent")).toBe("warning");
    expect(statusTone("draft")).toBe("info");
    expect(statusTone("planned")).toBe("info");
    expect(statusDotClass("paid")).toContain("emerald");
    expect(statusDotClass("overdue")).toContain("red");
    expect(statusDotClass("draft")).toContain("sky");
  });
});

describe("home copy", () => {
  it("greets by time of day and skips a generic You", () => {
    expect.hasAssertions();
    expect(greeting("You", new Date("2026-09-01T09:00:00"))).toBe("Good morning");
    expect(greeting("Ada Lovelace", new Date("2026-09-01T15:00:00"))).toBe("Good afternoon, Ada");
    expect(greeting("Jane", new Date("2026-09-01T20:00:00"))).toBe("Good evening, Jane");
  });

  it("uses featured views on home, or local lists when none are featured", () => {
    expect.hasAssertions();
    const type = {
      id: "t1",
      key: "expense",
      label: "Expense",
      store: "local",
      fields: [],
    } as TypeDef;
    const featured = {
      id: "v1",
      key: "active_projects",
      label: "Active projects",
      source: "project",
      fields: [],
    } as ViewDef;
    const implicit = {
      id: "v2",
      key: "all_expense",
      label: "Expenses",
      source: "expense",
      fields: [],
      implicit: true,
    } as ViewDef;
    const withFeatured = { views: [featured, implicit], types: [type] } as AppSpec;
    const localOnly = { views: [implicit], types: [type] } as AppSpec;
    expect(homeViews(withFeatured).map((view) => view.key)).toEqual(["active_projects"]);
    expect(homeViews(localOnly).map((view) => view.key)).toEqual(["all_expense"]);
  });
});
