import { describe, expect, it } from "vite-plus/test";
import { guessPageIcon, normalizePageIcon } from "./page-icons.ts";

describe("page icons", () => {
  it("guesses from widgets and ignores unknown keys", () => {
    expect.hasAssertions();
    expect(
      guessPageIcon([
        {
          kind: "group",
          columns: 1,
          blocks: [{ kind: "widget", widget: "kanban", values: { view: "tasks" } }],
        },
      ]),
    ).toBe("board");
    expect(guessPageIcon([{ kind: "widget", widget: "calendar", values: { date: "due" } }])).toBe(
      "calendar",
    );
    expect(normalizePageIcon("chart")).toBe("chart");
    expect(normalizePageIcon("not-an-icon")).toBeUndefined();
  });
});
