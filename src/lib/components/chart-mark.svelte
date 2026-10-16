<script lang="ts">
 import type { ViewDraft } from "@jthum/framework/svelte/authoring/data";
 import { viewCellValue } from "$lib/app/view-results.ts";
 import { toneFromAccent } from "$lib/app/color.ts";
 import { session } from "$lib/app/session.svelte.ts";
 import ChartFrame from "./chart-frame.svelte";
 import ChartPlot from "./chart-plot.svelte";
 import ChartPattern from "./chart-pattern.svelte";
 import { groupChart, totals } from "$lib/runtime/chart-data.ts";
 import { ChartInteraction, chartDash, chartPatternId } from "$lib/runtime/chart-interaction.svelte.ts";
 import { areaPath, band, chartPalette, donutSlice, extent, linear, niceTicks, polyline, stackOffsets } from "$lib/runtime/chart-geometry.ts";

 let { mark, title, rows, view, category, value = "", series = "", time = false, ready = true }: {
  mark: "bar" | "line" | "donut" | "stacked";
  title: string;
  rows: Array<Record<string, unknown>> | null;
  view: ViewDraft;
  category: string;
  value?: string;
  series?: string;
  time?: boolean;
  ready?: boolean;
 } = $props();

 const prefix = $props.id();
 const interaction = new ChartInteraction();
 const grouped = $derived(groupChart(rows ?? [], { category, value: value || undefined, series: series || undefined, time: time || mark === "line" }, (row, path) => viewCellValue(view, row, path)));
 const categoryLegend = $derived(mark === "donut" || (mark === "bar" && grouped.series.length <= 1));
 const colors = $derived(chartPalette(toneFromAccent(session.accent).hue, Math.max(grouped.series.length, grouped.categories.length, 1)));
 const categoryTotals = $derived(totals(grouped));
 const legend = $derived((categoryLegend ? grouped.categories : grouped.series).map((item, index) => ({ key: item.key, label: item.label, color: colors[index]!, index, line: mark === "line", text: `${item.label}: ${(categoryLegend ? categoryTotals[index]! : grouped.series[index]!.values.reduce((sum, value) => sum + value, 0)).toLocaleString()}` })));
 const indexes = $derived(grouped.categories.map((_, index) => index).filter((index) => !categoryLegend || !interaction.hidden.has(grouped.categories[index]!.key)));
 const plot = $derived({
  categories: indexes.map((index) => grouped.categories[index]!),
  series: grouped.series.filter((item) => categoryLegend || !interaction.hidden.has(item.key)).map((item) => ({ ...item, values: indexes.map((index) => item.values[index] ?? 0) })),
 });
 const donutValues = $derived(totals(plot));
 const donutTotal = $derived(donutValues.reduce((sum, amount) => sum + amount, 0));
 const invalidDonut = $derived(mark === "donut" && donutValues.some((amount) => amount < 0));
 const data = $derived({ columns: [category || "Category", ...grouped.series.map((item) => series ? item.label : value || "Count")], rows: grouped.categories.map((item, index) => [item.label, ...grouped.series.map((item) => item.values[index] ?? 0)]) });
 const ids = $derived(mark === "line"
  ? plot.series.flatMap((item) => plot.categories.map((cat) => JSON.stringify([cat.key, item.key])))
  : plot.categories.flatMap((cat, index) => mark === "donut"
   ? (donutValues[index]! > 0 ? [JSON.stringify([cat.key])] : [])
   : plot.series.map((item) => JSON.stringify([cat.key, item.key]))));

 const styles = $derived(new Map(legend.map((item) => [item.key, item.index])));
 $effect(() => interaction.reconcile(legend.map((item) => item.key), ids));
 function styleIndex(key: string): number { return styles.get(key) ?? 0; }
 function pattern(key: string) { return `url(#${chartPatternId(prefix, styleIndex(key))})`; }
 function datum(categoryIndex: number, seriesIndex = 0) {
  const cat = plot.categories[categoryIndex]!;
  const item = plot.series[seriesIndex]!;
  return { id: JSON.stringify(mark === "donut" ? [cat.key] : [cat.key, item.key]), key: categoryLegend ? cat.key : item.key, text: `${cat.label}${series ? ` · ${item.label}` : ""}: ${(mark === "donut" ? donutValues[categoryIndex]! : item.values[categoryIndex] ?? 0).toLocaleString()}` };
 }
 function formatTick(n: number) { return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
</script>

<ChartFrame {title} {ready} empty={!rows?.length || !category || !grouped.categories.length} {legend} {interaction} hidden={interaction.hidden} onToggle={(key) => interaction.toggle(key)} {data}>
 {#if invalidDonut}
  <p class="m-auto text-sm text-muted-foreground">Donut charts need non-negative values. Use a bar chart for signed values.</p>
 {:else if !plot.categories.length || !plot.series.length}
  <p class="m-auto text-sm text-muted-foreground">All items are hidden. Use the legend to show them again.</p>
 {:else}
 <ChartPlot>
  {#snippet children({ width, height })}
   {@const padL = mark === "donut" ? 16 : 44}
   {@const padT = 18}
   {@const innerW = Math.max(width - padL - 16, 1)}
   {@const innerH = Math.max(height - padT - 34, 1)}
   {@const offsets = stackOffsets(plot.categories.map((_, index) => plot.series.map((item) => item.values[index] ?? 0)))}
   {@const values = plot.series.flatMap((item, s) => item.values.flatMap((amount, c) => mark === "stacked" ? [offsets[c]![s]!, offsets[c]![s]! + amount] : [amount]))}
   {@const domain = extent(values)}
   {@const y = linear(domain, [padT + innerH, padT])}
   {@const slots = band(plot.categories.length, padL, padL + innerW)}
   <svg width={width} height={height} viewBox="0 0 {width} {height}" class="block size-full" role="group" aria-label={title} aria-describedby={`${prefix}-help`} data-chart-plot>
    <desc id={`${prefix}-help`}>Use Tab to enter the chart, arrow keys to explore values, Home and End to reach the first and last value, and Escape to clear the highlight. Use the legend to hide or show items. View chart data provides the exact values.</desc>
    <defs>{#each legend as item (item.key)}<ChartPattern id={chartPatternId(prefix, item.index)} index={item.index} color={item.color} />{/each}</defs>
    {#if mark !== "donut"}
     <g aria-hidden="true">
      {#each niceTicks(domain[0], domain[1], 4) as tick (tick)}
       <line x1={padL} x2={padL + innerW} y1={y(tick)} y2={y(tick)} class="stroke-border" stroke-dasharray={tick === 0 ? undefined : "3 4"} />
       <text x={padL - 8} y={y(tick)} text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground" font-size="10">{formatTick(tick)}</text>
      {/each}
      {#each plot.categories as cat, index (cat.key)}
       {#if plot.categories.length <= 8 || index % Math.ceil(plot.categories.length / 8) === 0}<text x={slots.x(index) + slots.bandwidth / 2} y={height - 10} text-anchor="middle" class="fill-muted-foreground" font-size="10">{cat.label.length > 10 ? `${cat.label.slice(0, 9)}…` : cat.label}</text>{/if}
      {/each}
     </g>
    {/if}
    {#if mark === "bar" || mark === "stacked"}
     {#each plot.categories as cat, c (cat.key)}
      {#each plot.series as item, s (item.key)}
       {@const point = datum(c, s)}
       {@const amount = item.values[c] ?? 0}
       {@const start = mark === "stacked" ? offsets[c]![s]! : 0}
       {@const inner = band(plot.series.length, slots.x(c), slots.x(c) + slots.bandwidth, 0.12)}
       <rect x={mark === "stacked" || categoryLegend ? slots.x(c) : inner.x(s)} y={Math.min(y(start + amount), y(start))} width={mark === "stacked" || categoryLegend ? slots.bandwidth : inner.bandwidth} height={Math.max(Math.abs(y(start) - y(start + amount)), 2)} rx="3" fill={pattern(point.key)} data-chart-mark {...interaction.mark(point, ids)}><title>{point.text}</title></rect>
      {/each}
     {/each}
    {:else if mark === "line"}
     {#each plot.series as item, s (item.key)}
      {@const points = plot.categories.map((_, c): [number, number] => [slots.x(c) + slots.bandwidth / 2, y(item.values[c] ?? 0)])}
      {@const index = styleIndex(item.key)}
      <path d={areaPath(points, y(0))} fill={pattern(item.key)} fill-opacity="0.12" aria-hidden="true" data-chart-mark {...interaction.state(item.key)} />
      <path d={polyline(points)} stroke={colors[index]} stroke-dasharray={chartDash(index)} stroke-linejoin="round" stroke-linecap="round" data-chart-line data-chart-mark {...interaction.state(item.key)} {...interaction.events({ id: `series:${item.key}`, key: item.key, text: item.label })} aria-hidden="true" />
      {#each points as point, c (c)}
       {@const value = datum(c, s)}
       <circle cx={point[0]} cy={point[1]} r="5" fill={colors[index]} stroke="var(--background)" stroke-width="2" data-chart-mark {...interaction.mark(value, ids)}><title>{value.text}</title></circle>
      {/each}
     {/each}
    {:else if mark === "donut"}
     {@const cx = padL + innerW / 2}
     {@const cy = padT + innerH / 2}
     {@const outer = Math.max(1, Math.min(innerW, innerH) / 2 - 4)}
     {@const inner = outer * 0.64}
     {#each plot.categories as cat, c (cat.key)}
      {#if donutValues[c]! > 0 && donutTotal > 0}
       {@const before = donutValues.slice(0, c).reduce((sum, n) => sum + n, 0) / donutTotal}
       {@const span = donutValues[c]! / donutTotal}
       {@const gap = Math.min(0.025, span * Math.PI)}
       {@const point = datum(c)}
       <path d={donutSlice(cx, cy, outer, inner, -Math.PI / 2 + before * Math.PI * 2 + gap / 2, -Math.PI / 2 + (before + span) * Math.PI * 2 - gap / 2)} fill={pattern(point.key)} data-chart-mark {...interaction.mark(point, ids)}><title>{point.text}</title></path>
      {/if}
     {/each}
     <g aria-hidden="true"><text x={cx} y={cy - 6} text-anchor="middle" class="fill-muted-foreground" font-size="11">Total</text><text x={cx} y={cy + 14} text-anchor="middle" class="fill-foreground" font-size="20" font-weight="600">{formatTick(donutTotal)}</text></g>
    {/if}
   </svg>
  {/snippet}
 </ChartPlot>
 {/if}
</ChartFrame>
