import { describe, expect, it } from "vite-plus/test";
import {
  aggregateRatingMax,
  collectionLabel,
  formatCell,
  greeting,
  homeViews,
  statusDotClass,
  statusTone,
} from "./labels.ts";
import type { PageContext, CollectionDraft, ViewDraft } from "$lib/blocks/presentation.ts";

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

describe("cell formatting", () => {
  it("can limit aggregate presentation to two decimal places", () => {
    expect(formatCell("overall_score", 4.6666, { maximumFractionDigits: 2 })).toBe("4.67");
    expect(formatCell("overall_score", 4.5, { maximumFractionDigits: 2 })).toBe("4.5");
  });
});

describe("aggregate rating formatting", () => {
  const type: CollectionDraft = {
    id: "B000000000000001",
    key: "review",
    label: "Review",
    fields: [
      {
        id: "A000000000000007",
        key: "quality",
        label: "Quality",
        type: "number",
        presentation: "rating",
        max: 5,
      },
      {
        id: "A000000000000006",
        key: "impact",
        label: "Impact",
        type: "number",
        presentation: "rating",
        max: 5,
      },
      { id: "A000000000000005", key: "budget", label: "Budget", type: "number" },
    ],
  };
  const view: ViewDraft = {
    id: "vie_scores",
    key: "scores",
    label: "Scores",
    source: "review",
    fields: ["overall_score"],
    group_by: "submission",
    measures: {
      overall_score: { op: "avg", fields: ["quality", "impact"] },
      average_budget: { op: "avg", field: "budget" },
    },
  };

  it("returns the shared scale for averages of rating fields", () => {
    expect(aggregateRatingMax(view, type, "overall_score")).toBe(5);
  });

  it("does not style ordinary numeric averages as ratings", () => {
    expect(aggregateRatingMax(view, type, "average_budget")).toBeUndefined();
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
    } as CollectionDraft;
    const featured = {
      id: "v1",
      key: "active_projects",
      label: "Active projects",
      source: "project",
      fields: [],
    } as ViewDraft;
    const implicit = {
      id: "v2",
      key: "all_expense",
      label: "Expenses",
      source: "expense",
      fields: [],
      implicit: true,
    } as ViewDraft;
    const withFeatured = { views: [featured, implicit], types: [type] } as PageContext;
    const localOnly = { views: [implicit], types: [type] } as PageContext;
    expect(homeViews(withFeatured).map((view) => view.key)).toEqual(["active_projects"]);
    expect(homeViews(localOnly).map((view) => view.key)).toEqual(["all_expense"]);
  });
});

describe("collection labels", () => {
  const type = (label: string, collection_label?: string) =>
    ({
      id: "B000000000000004",
      key: "item",
      label,
      collection_label,
      store: "local",
      fields: [],
    }) as CollectionDraft;

  it("infers regular, irregular, already-plural, and uncountable English names", () => {
    expect(collectionLabel(type("Project"))).toBe("Projects");
    expect(collectionLabel(type("Person"))).toBe("People");
    expect(collectionLabel(type("People"))).toBe("People");
    expect(collectionLabel(type("Category"))).toBe("Categories");
    expect(collectionLabel(type("Equipment"))).toBe("Equipment");
  });

  it("prefers an explicit collection name", () => {
    expect(collectionLabel(type("Person", "Team directory"))).toBe("Team directory");
  });
});
