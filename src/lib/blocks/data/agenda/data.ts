import { viewCellValue } from "$lib/app/view-results.ts";
import type { ViewDraft } from "$lib/blocks/presentation.ts";

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A calendar date keeps its day; an instant is shown in the viewer's timezone. */
export function agendaDate(
  value: unknown,
): { day: string; time: number; date: Date; instant: boolean } | undefined {
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year!, month! - 1, day!);
    date.setHours(0, 0, 0, 0);
    return localDay(date) === value
      ? { day: value, time: date.getTime(), date, instant: false }
      : undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return undefined;
  if (!agendaDate(value.slice(0, 10))) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? { day: localDay(date), time: date.getTime(), date, instant: true }
    : undefined;
}

export function agendaGroups(
  view: ViewDraft,
  rows: Record<string, unknown>[],
  field: string,
  now: Date,
  limit = 8,
) {
  const today = localDay(now);
  const items = rows
    .flatMap((row, index) => {
      const date = agendaDate(viewCellValue(view, row, field));
      return date ? [{ row, index, ...date }] : [];
    })
    .sort((left, right) => left.time - right.time)
    .slice(0, Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.floor(limit))) : 8);
  return [
    { label: "Overdue", items: items.filter((item) => item.day < today) },
    { label: "Today", items: items.filter((item) => item.day === today) },
    { label: "Upcoming", items: items.filter((item) => item.day > today) },
  ].filter((group) => group.items.length > 0);
}
