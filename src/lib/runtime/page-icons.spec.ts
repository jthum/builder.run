import { describe, expect, it } from "vite-plus/test";
import { guessPageIcon, normalizePageIcon } from "./page-icons.ts";

describe("page icons", () => {
  it("guesses from blocks and ignores unknown keys", () => {
    expect.hasAssertions();
    expect(
      guessPageIcon([
        {
          kind: "group",
          columns: 1,
          blocks: [{ kind: "block", block: "kanban", config: { view: "tasks" } }],
        },
      ]),
    ).toBe("board");
    expect(guessPageIcon([{ kind: "block", block: "calendar", config: { date: "due" } }])).toBe(
      "calendar",
    );
    expect(normalizePageIcon("chart")).toBe("chart");
    expect(normalizePageIcon("not-an-icon")).toBeUndefined();
  });
});
