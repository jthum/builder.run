import { viewCellValue } from "$lib/app/view-results.ts";
import { asLabel } from "$lib/runtime/chart-data.ts";
import type { ViewDraft } from "$lib/blocks/presentation.ts";

export function statusBreakdown(
  view: ViewDraft,
  rows: Record<string, unknown>[],
  field: string,
  valueField = "",
) {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const raw = viewCellValue(view, row, valueField);
    const value = valueField
      ? typeof raw === "number" && Number.isFinite(raw) && raw >= 0
        ? raw
        : 0
      : 1;
    const label = asLabel(viewCellValue(view, row, field));
    groups.set(label, (groups.get(label) ?? 0) + value);
  }
  const total = [...groups.values()].reduce((sum, value) => sum + value, 0);
  return {
    total,
    groups: [...groups].map(([label, value]) => ({
      label,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
    })),
  };
}
