export function cellValue(row: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  if (!path.includes(".")) return row[path];
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, row);
}

export function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function asLabel(value: unknown): string {
  if (value == null || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function asDayKey(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value);
  const day = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export interface ChartCategory {
  key: string;
  label: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  values: number[];
}

export interface GroupedChart {
  categories: ChartCategory[];
  series: ChartSeries[];
}

export function groupChart(
  rows: Array<Record<string, unknown>>,
  options: { category: string; value?: string; series?: string; time?: boolean },
): GroupedChart {
  const categories: ChartCategory[] = [];
  const categoryIndex = new Map<string, number>();
  const seriesIndex = new Map<string, number>();
  const seriesMeta: Array<{ key: string; label: string }> = [];
  const counts = new Map<string, number>();

  function categoryOf(row: Record<string, unknown>): ChartCategory | null {
    if (options.time) {
      const day = asDayKey(cellValue(row, options.category));
      if (!day) return null;
      return { key: day, label: day };
    }
    const raw = cellValue(row, options.category);
    const key = asLabel(raw);
    return { key, label: key };
  }

  for (const row of rows) {
    const category = categoryOf(row);
    if (!category) continue;
    if (!categoryIndex.has(category.key)) {
      categoryIndex.set(category.key, categories.length);
      categories.push(category);
    }
    const seriesRaw = options.series ? cellValue(row, options.series) : "value";
    const seriesKey = options.series ? asLabel(seriesRaw) : "value";
    if (!seriesIndex.has(seriesKey)) {
      seriesIndex.set(seriesKey, seriesMeta.length);
      seriesMeta.push({ key: seriesKey, label: options.series ? seriesKey : "Value" });
    }
    const amount = options.value ? asNumber(cellValue(row, options.value)) : 1;
    const token = `${category.key}\0${seriesKey}`;
    counts.set(token, (counts.get(token) ?? 0) + amount);
  }

  if (options.time) categories.sort((a, b) => a.key.localeCompare(b.key));

  const series = seriesMeta.map((item) => ({
    key: item.key,
    label: item.label,
    values: categories.map((category) => counts.get(`${category.key}\0${item.key}`) ?? 0),
  }));

  return { categories, series };
}

export function totals(chart: GroupedChart): number[] {
  if (!chart.categories.length) return [];
  return chart.categories.map((_, index) =>
    chart.series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0),
  );
}

export function sparkline(chart: GroupedChart): number[] {
  return totals(chart);
}
