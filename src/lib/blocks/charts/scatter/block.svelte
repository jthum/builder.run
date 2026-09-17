<script lang="ts">
	import { toneFromAccent } from "$lib/app/color.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import ChartFrame from "$lib/components/chart-frame.svelte";
	import ChartPlot from "$lib/components/chart-plot.svelte";
	import { asLabel, asNumber, cellValue } from "$lib/runtime/chart-data.ts";
	import { chartPalette, extent, linear, niceTicks } from "$lib/runtime/chart-geometry.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const xField = $derived(String(config.x ?? ""));
	const yField = $derived(String(config.y ?? ""));
	const labelField = $derived(String(config.label ?? ""));
	const points = $derived(
		(rows[viewKey] ?? []).map((item, index) => ({
			id: String(item.id ?? index),
			x: asNumber(cellValue(item, xField)),
			y: asNumber(cellValue(item, yField)),
			label: labelField ? asLabel(cellValue(item, labelField)) : `Record ${index + 1}`,
		})),
	);
	const hue = $derived(toneFromAccent(session.accent).hue);
	const color = $derived(chartPalette(hue, 1)[0]);
	let hover = $state<{ x: number; y: number; text: string } | null>(null);

	function formatTick(value: number): string {
		if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
		return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}
</script>

{#if view}
	<ChartFrame title={String(config.title || view.label)} {ready} empty={ready && !points.length}>
		<ChartPlot>
			{#snippet children({ width, height })}
				{@const padL = 42}
				{@const padR = 28}
				{@const padT = 18}
				{@const padB = 32}
				{@const xDomain = extent(points.map((point) => point.x))}
				{@const yDomain = extent(points.map((point) => point.y))}
				{@const xScale = linear(xDomain, [padL, width - padR])}
				{@const yScale = linear(yDomain, [height - padB, padT])}
				<svg width={width} height={height} viewBox="0 0 {width} {height}" class="block size-full" role="img" aria-label={String(config.title || view.label)} onmouseleave={() => (hover = null)}>
					{#each niceTicks(yDomain[0], yDomain[1], 4) as tick (tick)}
						<line x1={padL} x2={width - padR} y1={yScale(tick)} y2={yScale(tick)} class="stroke-border" />
						<text x={padL - 6} y={yScale(tick)} text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground" font-size="10">{formatTick(tick)}</text>
					{/each}
					{#each niceTicks(xDomain[0], xDomain[1], 4) as tick (tick)}
						<text x={xScale(tick)} y={height - 8} text-anchor="middle" class="fill-muted-foreground" font-size="10">{formatTick(tick)}</text>
					{/each}
					{#each points as point (point.id)}
						<circle cx={xScale(point.x)} cy={yScale(point.y)} r="5" fill={color} opacity="0.88" role="presentation" onmouseenter={(event) => (hover = { x: event.offsetX, y: event.offsetY, text: `${point.label}: ${formatTick(point.x)} × ${formatTick(point.y)}` })}>
							<title>{point.label}: {point.x} × {point.y}</title>
						</circle>
					{/each}
				</svg>
				{#if hover}<div class="pointer-events-none absolute rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm" style="left: {Math.min(hover.x + 8, width - 8)}px; top: {Math.max(hover.y - 28, 4)}px">{hover.text}</div>{/if}
			{/snippet}
		</ChartPlot>
	</ChartFrame>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
