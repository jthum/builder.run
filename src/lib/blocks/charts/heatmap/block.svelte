<script lang="ts">
 import ChartFrame from "$lib/components/chart-frame.svelte";
 import ChartPlot from "$lib/components/chart-plot.svelte";
 import ChartPattern from "$lib/components/chart-pattern.svelte";
 import { asDayKey, asNumber } from "$lib/runtime/chart-data.ts";
 import { viewCellValue } from "$lib/app/view-results.ts";
 import { ChartInteraction, chartPatternId } from "$lib/runtime/chart-interaction.svelte.ts";
 import type { BlockProps } from "$lib/blocks/types.ts";

 let { config, rows, ready = true, spec }: BlockProps = $props();
 const prefix = $props.id();
 const interaction = new ChartInteraction();
 const view = $derived(spec?.views.find((item) => item.key === config.view));
 const dateField = $derived(String(config.date ?? ""));
 const valueField = $derived(String(config.value ?? ""));
 const amounts = $derived.by(() => {
  const result = new Map<string, number>();
  for (const item of rows[String(config.view ?? "")] ?? []) {
   const day = asDayKey(viewCellValue(view, item, dateField));
   if (!day) continue;
   const date = new Date(`${day}T00:00:00Z`);
   if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) continue;
   result.set(day, (result.get(day) ?? 0) + (valueField ? asNumber(viewCellValue(view, item, valueField)) : 1));
  }
  return result;
 });
 const cells = $derived(calendarCells(amounts));
 const maximum = $derived(Math.max(...cells.map((cell) => cell.value), 1));
 const labels = ["No activity", "Low", "Moderate", "High", "Peak"];
 const colors = ["var(--muted)", ...[30, 50, 75, 100].map((amount) => `color-mix(in oklab, var(--primary) ${amount}%, var(--background))`)];
 const legend = labels.map((label, index) => ({ key: String(index), label, index: Math.max(0, index - 1), color: colors[index]!, plain: index === 0 }));
 const visible = $derived(cells.filter((cell) => !interaction.hidden.has(String(level(cell.value)))));
 const ids = $derived(visible.map((cell) => cell.key));
 $effect(() => interaction.reconcile(legend.map((item) => item.key), ids));
 const data = $derived({ columns: ["Date", valueField || "Count"], rows: cells.map((cell) => [cell.key, cell.value]) });

 function level(value: number): number {
  if (!value) return 0;
  return Math.max(1, Math.min(4, Math.ceil((value / maximum) * 4)));
 }
 function calendarCells(valuesByDay: Map<string, number>) {
  const latest = [...valuesByDay.keys()].sort().at(-1);
  const end = latest ? new Date(`${latest}T00:00:00Z`) : new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 55);
  return Array.from({ length: 56 }, (_, index) => {
   const date = new Date(start);
   date.setUTCDate(start.getUTCDate() + index);
   const key = date.toISOString().slice(0, 10);
   return { key, index, value: valuesByDay.get(key) ?? 0 };
  });
 }
</script>

{#if view}
 <ChartFrame title={String(config.title || view.label)} {ready} {interaction} {legend} hidden={interaction.hidden} onToggle={(key) => interaction.toggle(key)} {data}>
  {#if !visible.length}<p class="m-auto text-sm text-muted-foreground">All items are hidden. Use the legend to show them again.</p>
  {:else}
  <ChartPlot>
   {#snippet children({ width, height })}
    {@const gap = 5}
    {@const size = Math.max(1, Math.min((width - 40 - gap * 7) / 8, (height - 28 - gap * 6) / 7))}
    <svg {width} {height} viewBox="0 0 {width} {height}" role="group" aria-label={String(config.title || view.label)} data-chart-plot aria-describedby={`${prefix}-help`}>
     <desc id={`${prefix}-help`}>Eight weeks of daily activity. Arrow keys explore days; Escape clears the highlight. Patterns and colour indicate increasing activity from Low to Peak. Use the legend to hide or show levels. View chart data lists exact daily values.</desc>
     <defs>{#each legend.slice(1) as item (item.key)}<ChartPattern id={chartPatternId(prefix, Number(item.key))} index={item.index} color={item.color} />{/each}</defs>
     <g aria-hidden="true" class="fill-muted-foreground" font-size="10">
      <text x="0" y={22 + (size + gap) + size * 0.7}>Mon</text>
      <text x="0" y={22 + (size + gap) * 3 + size * 0.7}>Wed</text>
      <text x="0" y={22 + (size + gap) * 5 + size * 0.7}>Fri</text>
      <text x="36" y="12">{cells[0]?.key}</text>
      <text x={36 + (size + gap) * 8 - gap} y="12" text-anchor="end">{cells.at(-1)?.key}</text>
     </g>
     {#each visible as cell (cell.key)}
      {@const intensity = level(cell.value)}
      <rect x={36 + Math.floor(cell.index / 7) * (size + gap)} y={22 + (cell.index % 7) * (size + gap)} width={size} height={size} rx="3" fill={intensity ? `url(#${chartPatternId(prefix, intensity)})` : colors[0]} data-chart-mark {...interaction.mark({ id: cell.key, key: String(intensity), text: `${cell.key}: ${cell.value.toLocaleString()}` }, ids)}><title>{cell.key}: {cell.value.toLocaleString()}</title></rect>
     {/each}
    </svg>
   {/snippet}
  </ChartPlot>
  {/if}
 </ChartFrame>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
