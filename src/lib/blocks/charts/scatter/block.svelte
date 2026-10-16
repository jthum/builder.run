<script lang="ts">
	import { toneFromAccent } from "$lib/app/color.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import ChartFrame from "$lib/components/chart-frame.svelte";
	import ChartPlot from "$lib/components/chart-plot.svelte";
	import ChartPattern from "$lib/components/chart-pattern.svelte";
	import { ChartInteraction, chartPatternId } from "$lib/runtime/chart-interaction.svelte.ts";
	import { asLabel } from "$lib/runtime/chart-data.ts";
	import { viewCellValue } from "$lib/app/view-results.ts";
	import { chartPalette, extent, linear, niceTicks } from "$lib/runtime/chart-geometry.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const xField = $derived(String(config.x ?? ""));
	const yField = $derived(String(config.y ?? ""));
	const labelField = $derived(String(config.label ?? ""));
	const points = $derived(
		(rows[viewKey] ?? []).flatMap((item, index) => {
			const x = coordinate(viewCellValue(view, item, xField));
			const y = coordinate(viewCellValue(view, item, yField));
			if (x === undefined || y === undefined) return [];
			return [{ id: String(item.id ?? index), x, y,
				label: labelField ? asLabel(viewCellValue(view, item, labelField)) : `Record ${index + 1}` }];
		}),
	);
	const hue = $derived(toneFromAccent(session.accent).hue);
	const color = $derived(chartPalette(hue, 1)[0]);
	const prefix = $props.id();
	const interaction = new ChartInteraction();
	const ids = $derived(points.map((point, index) => JSON.stringify([point.id, index])));
	$effect(() => interaction.reconcile(ids, ids));
	const data = $derived({ columns: [labelField || "Record", xField, yField], rows: points.map((point) => [point.label, point.x, point.y]) });

	function coordinate(value: unknown): number | undefined {
		if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
		const number = Number(value);
		return Number.isFinite(number) ? number : undefined;
	}

	function formatTick(value: number): string {
		if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
		return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}
</script>

{#if view}
	<ChartFrame title={String(config.title || view.label)} {ready} empty={ready && !points.length} {interaction} {data}>
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
				<svg width={width} height={height} viewBox="0 0 {width} {height}" class="block size-full" role="group" aria-label={String(config.title || view.label)} data-chart-plot aria-describedby={`${prefix}-help`}>
					<desc id={`${prefix}-help`}>Use arrow keys to explore points, Home and End to reach the endpoints, and Escape to clear the highlight. Horizontal axis: {xField}. Vertical axis: {yField}.</desc>
					<defs><ChartPattern id={chartPatternId(prefix, 0)} index={0} color={color!} /></defs>
					<g aria-hidden="true">
					{#each niceTicks(yDomain[0], yDomain[1], 4) as tick (tick)}
						<line x1={padL} x2={width - padR} y1={yScale(tick)} y2={yScale(tick)} class="stroke-border" />
						<text x={padL - 6} y={yScale(tick)} text-anchor="end" dominant-baseline="middle" class="fill-muted-foreground" font-size="10">{formatTick(tick)}</text>
					{/each}
					{#each niceTicks(xDomain[0], xDomain[1], 4) as tick (tick)}
						<text x={xScale(tick)} y={height - 8} text-anchor="middle" class="fill-muted-foreground" font-size="10">{formatTick(tick)}</text>
					{/each}
					</g>
					{#each points as point, index (ids[index])}
						<circle cx={xScale(point.x)} cy={yScale(point.y)} r="6" fill={`url(#${chartPatternId(prefix, 0)})`} data-chart-mark {...interaction.mark({ id: ids[index]!, key: ids[index]!, text: `${point.label}: ${point.x} × ${point.y} (${xField} × ${yField})` }, ids)}>
							<title>{point.label}: {point.x} × {point.y}</title>
						</circle>
					{/each}
				</svg>
			{/snippet}
		</ChartPlot>
	</ChartFrame>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
