import { describe, expect, it } from "vite-plus/test";
import { agendaDate, agendaGroups, localDay } from "./data.ts";
import type { ViewDraft } from "$lib/blocks/presentation.ts";

const now = new Date(2026, 0, 15, 12);
const view: ViewDraft = {
  id: "tasks",
  key: "tasks",
  label: "Tasks",
  source: "task",
  fields: ["due_date"],
  aliases: { due_date: ["deadline", "value"] },
};
const row = (id: string, date: unknown) => ({ id, deadline: { value: date } });

describe("agenda dates", () => {
  it("keeps date-only values on their calendar day", () => {
    const parsed = agendaDate("2026-01-15")!;
    expect(parsed.day).toBe("2026-01-15");
    expect(parsed.date.getDate()).toBe(15);
    expect(localDay(parsed.date)).toBe("2026-01-15");
  });

  it("groups timestamps by the viewer's local calendar day", () => {
    const instant = new Date(2026, 0, 15, 0, 15).toISOString();
    expect(agendaDate(instant)?.day).toBe("2026-01-15");
    expect(agendaGroups(view, [row("instant", instant)], "due_date", now)[0]?.label).toBe("Today");
  });

  it.each([
    null,
    undefined,
    "",
    "not-a-date",
    "2026-02-30",
    "2026-02-30T10:00:00Z",
    "2026-13-01",
    "2026-00-01",
    0,
  ])("ignores missing and invalid dates: %s", (date) => {
    expect(agendaDate(date)).toBeUndefined();
  });

  it("sorts before limiting, groups only dated items and does not mutate rows", () => {
    const rows = [
      row("future", "2026-01-17"),
      row("today", "2026-01-15"),
      row("invalid", null),
      row("overdue", "2026-01-14"),
    ];
    const groups = agendaGroups(view, rows, "due_date", now);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.row.id)])).toEqual([
      ["Overdue", ["overdue"]],
      ["Today", ["today"]],
      ["Upcoming", ["future"]],
    ]);
    expect(agendaGroups(view, rows, "due_date", now, 1)[0]?.items[0]?.row.id).toBe("overdue");
    expect(rows[0]?.id).toBe("future");
    expect(agendaGroups(view, [], "due_date", now)).toEqual([]);
  });

  it("supports flat aliases and clamps malformed limits", () => {
    const flat: ViewDraft = { ...view, aliases: { due_date: "deadline" } };
    const rows = Array.from({ length: 40 }, (_, id) => ({ id, deadline: "2026-01-15" }));
    expect(agendaGroups(flat, rows, "due_date", now, 100)[0]?.items).toHaveLength(30);
    expect(agendaGroups(flat, rows, "due_date", now, NaN)[0]?.items).toHaveLength(8);
    expect(agendaGroups(flat, rows, "due_date", now, -1)[0]?.items).toHaveLength(1);
  });
});
