<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import { toneFromAccent } from "$lib/app/color.ts";
	import ChartFrame from "$lib/components/chart-frame.svelte";
	import { asLabel, asNumber } from "$lib/runtime/chart-data.ts";
	import { viewCellValue } from "$lib/app/view-results.ts";
	import { chartPalette } from "$lib/runtime/chart-geometry.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const stageField = $derived(String(config.stage ?? ""));
	const valueField = $derived(String(config.value ?? ""));
	const stages = $derived(
		(rows[viewKey] ?? []).map((item) => ({
			label: asLabel(viewCellValue(view, item, stageField)),
			value: valueField ? asNumber(viewCellValue(view, item, valueField)) : 1,
		})),
	);
	const maximum = $derived(Math.max(...stages.map((stage) => stage.value), 1));
	const hue = $derived(toneFromAccent(session.accent).hue);
	const colors = $derived(chartPalette(hue, Math.max(stages.length, 1)));
</script>

{#if view}
	<ChartFrame title={String(config.title || view.label)} {ready} empty={!stages.length}>
		<div class="flex flex-1 flex-col justify-center gap-3">
			{#each stages as stage, index (`${stage.label}-${index}`)}
				<div class="flex flex-col items-center gap-1">
					<div
						class="flex min-w-32 items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm font-medium text-white"
						style:width={`${Math.max(32, (stage.value / maximum) * 100)}%`}
						style:background={colors[index]}
					>
						<span class="truncate">{stage.label}</span>
						<span class="tabular-nums">{stage.value.toLocaleString()}</span>
					</div>
					{#if index < stages.length - 1}<span class="h-2 w-px bg-border"></span>{/if}
				</div>
			{/each}
		</div>
	</ChartFrame>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
