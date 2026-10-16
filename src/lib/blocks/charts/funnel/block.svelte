<script lang="ts">
 import { session } from "$lib/app/session.svelte.ts";
 import { toneFromAccent } from "$lib/app/color.ts";
 import ChartFrame from "$lib/components/chart-frame.svelte";
 import ChartPlot from "$lib/components/chart-plot.svelte";
 import ChartPattern from "$lib/components/chart-pattern.svelte";
 import { asLabel, asNumber } from "$lib/runtime/chart-data.ts";
 import { viewCellValue } from "$lib/app/view-results.ts";
 import { chartPalette } from "$lib/runtime/chart-geometry.ts";
 import { ChartInteraction, chartPatternId } from "$lib/runtime/chart-interaction.svelte.ts";
 import type { BlockProps } from "$lib/blocks/types.ts";

 let { config, rows, ready = true, spec }: BlockProps = $props();
 const prefix = $props.id();
 const interaction = new ChartInteraction();
 const view = $derived(spec?.views.find((item) => item.key === config.view));
 const stageField = $derived(String(config.stage ?? ""));
 const valueField = $derived(String(config.value ?? ""));
 const stages = $derived((rows[String(config.view ?? "")] ?? []).map((item, index) => ({
  key: String(index), label: asLabel(viewCellValue(view, item, stageField)),
  value: valueField ? asNumber(viewCellValue(view, item, valueField)) : 1,
 })));
 const maximum = $derived(Math.max(...stages.map((stage) => stage.value), 1));
 const colors = $derived(chartPalette(toneFromAccent(session.accent).hue, Math.max(stages.length, 1)));
 const legend = $derived(stages.map((stage, index) => ({ key: stage.key, label: stage.label, index, color: colors[index]! })));
 const visible = $derived(stages.filter((stage) => !interaction.hidden.has(stage.key)));
 const ids = $derived(visible.map((stage) => stage.key));
 $effect(() => interaction.reconcile(legend.map((item) => item.key), ids));
 const data = $derived({ columns: [stageField || "Stage", valueField || "Count"], rows: stages.map((stage) => [stage.label, stage.value]) });
</script>

{#if view}
 <ChartFrame title={String(config.title || view.label)} {ready} empty={!stages.length} {interaction} {legend} hidden={interaction.hidden} onToggle={(key) => interaction.toggle(key)} {data}>
  {#if !visible.length}<p class="m-auto text-sm text-muted-foreground">All items are hidden. Use the legend to show them again.</p>
  {:else if visible.some((stage) => stage.value < 0)}<p class="m-auto text-sm text-muted-foreground">Funnel charts need non-negative values. Use a bar chart for signed values.</p>
  {:else}
  <div class="flex flex-1" style:min-height={`${Math.max(160, visible.length * 44)}px`}>
   <ChartPlot>
    {#snippet children({ width, height })}
     {@const rowHeight = height / visible.length}
     <svg {width} {height} viewBox="0 0 {width} {height}" role="group" aria-label={String(config.title || view.label)} data-chart-plot aria-describedby={`${prefix}-help`}>
      <desc id={`${prefix}-help`}>Use arrow keys to explore stages. Escape clears the highlight. Use the legend to hide or show stages. Exact values are available in View chart data.</desc>
      <defs>{#each legend as item (item.key)}<ChartPattern id={chartPatternId(prefix, item.index)} index={item.index} color={item.color} />{/each}</defs>
      {#each visible as stage, index (stage.key)}
       {@const barWidth = Math.max(2, (stage.value / maximum) * (width - 24))}
       <g aria-hidden="true" class="fill-foreground" font-size="12">
        <text x="12" y={index * rowHeight + 14}>{stage.label.length > Math.floor(width / 9) ? `${stage.label.slice(0, Math.max(8, Math.floor(width / 9) - 1))}…` : stage.label}</text>
        <text x={width - 12} y={index * rowHeight + 14} text-anchor="end">{stage.value.toLocaleString()}</text>
       </g>
       <rect x={(width - barWidth) / 2} y={index * rowHeight + 22} width={barWidth} height={Math.max(8, rowHeight - 30)} rx="4" fill={`url(#${chartPatternId(prefix, Number(stage.key))})`} data-chart-mark {...interaction.mark({ id: stage.key, key: stage.key, text: `${stage.label}: ${stage.value.toLocaleString()}` }, ids)}><title>{stage.label}: {stage.value.toLocaleString()}</title></rect>
      {/each}
     </svg>
    {/snippet}
   </ChartPlot>
  </div>
  {/if}
 </ChartFrame>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
