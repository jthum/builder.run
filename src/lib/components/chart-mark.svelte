<script lang="ts">
	import type { ViewDraft } from "@jthum/framework/svelte/authoring/data";
	import { viewCellValue } from "$lib/app/view-results.ts";
	import { toneFromAccent } from "$lib/app/color.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import ChartFrame from "$lib/components/chart-frame.svelte";
	import ChartPlot from "$lib/components/chart-plot.svelte";
	import { groupChart, totals, type GroupedChart } from "$lib/runtime/chart-data.ts";
	import {
		areaPath,
		band,
		chartPalette,
		donutSlice,
		extent,
		hatchId,
		linear,
		niceTicks,
		polyline,
		stackOffsets,
	} from "$lib/runtime/chart-geometry.ts";

	let {
		mark,
		title,
		rows,
		view,
		category,
		value = "",
		series = "",
		time = false,
		ready = true,
	}: {
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

	let hidden = $state(new Set<string>());
	let hover = $state<{ x: number; y: number; text: string } | null>(null);

	const hue = $derived(toneFromAccent(session.accent).hue);
	const grouped = $derived.by((): GroupedChart => {
		if (!rows?.length || !category) return { categories: [], series: [] };
		return groupChart(rows, {
			category,
			value: value || undefined,
			series: series || undefined,
			time: time || mark === "line",
		}, (row, path) => viewCellValue(view, row, path));
	});
	const visible = $derived(grouped.series.filter((item) => !hidden.has(item.key)));
	const colors = $derived(
		chartPalette(hue, Math.max(grouped.series.length, grouped.categories.length, 1)),
	);
	const colorBySeries = $derived(
		new Map(grouped.series.map((item, index) => [item.key, colors[index % colors.length] ?? colors[0]])),
	);
	const colorByCategory = $derived(
		new Map(
			grouped.categories.map((item, index) => [item.key, colors[index % colors.length] ?? colors[0]]),
		),
	);
	const legend = $derived.by(() => {
		if (mark === "donut" || (mark === "bar" && grouped.series.length <= 1)) {
			return grouped.categories.map((item) => ({
				key: item.key,
				label: item.label,
				color: colorByCategory.get(item.key) ?? colors[0] ?? "#888",
			}));
		}
		return grouped.series.map((item) => ({
			key: item.key,
			label: item.label,
			color: colorBySeries.get(item.key) ?? colors[0] ?? "#888",
		}));
	});

	function formatTick(n: number): string {
		if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
		if (Number.isInteger(n)) return String(n);
		return n.toFixed(1);
	}

	function toggle(key: string) {
		const next = new Set(hidden);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		hidden = next;
	}

	function sliceHidden(chart: GroupedChart): GroupedChart {
		if (mark === "donut" || (mark === "bar" && chart.series.length <= 1)) {
			const indexes = chart.categories
				.map((item, index) => index)
				.filter((index) => !hidden.has(chart.categories[index]?.key ?? ""));
			return {
				categories: indexes.map((index) => chart.categories[index]!),
				series: chart.series.map((item) => ({
					...item,
					values: indexes.map((index) => item.values[index] ?? 0),
				})),
			};
		}
		return { categories: chart.categories, series: visible };
	}

	const plot = $derived(sliceHidden(grouped));
	const empty = $derived(ready && (!rows?.length || !plot.categories.length));
</script>

<ChartFrame
	{title}
	{ready}
	{empty}
	{legend}
	{hidden}
	onToggle={toggle}
>
	<ChartPlot>
		{#snippet children({ width, height })}
			{@const padL = mark === "donut" ? 12 : 40}
			{@const padR = 12}
			{@const padT = mark === "donut" ? 12 : 18}
			{@const padB = mark === "donut" ? 12 : 32}
			{@const innerW = Math.max(width - padL - padR, 1)}
			{@const innerH = Math.max(height - padT - padB, 1)}
			{@const values = plot.series.flatMap((item) => item.values)}
			{@const stackedValues = totals(plot)}
			{@const domain = extent(mark === "stacked" ? stackedValues : values)}
			{@const y = linear(domain, [padT + innerH, padT])}
			{@const ticks = niceTicks(domain[0], domain[1], 4)}
			{@const slots = band(plot.categories.length, padL, padL + innerW)}
			{@const offsets = stackOffsets(
				plot.categories.map((_, index) => plot.series.map((item) => item.values[index] ?? 0)),
			)}
			{@const donutValues = totals(plot)}
			{@const donutTotal = donutValues.reduce((sum, n) => sum + n, 0)}
			<svg
				width={width}
				height={height}
				viewBox="0 0 {width} {height}"
				class="block size-full overflow-hidden"
				role="img"
				aria-label={title}
				onmouseleave={() => (hover = null)}
			>
				<defs>
					{#each colors as color, index (index)}
						<pattern
							id={hatchId(index)}
							width="6"
							height="6"
							patternUnits="userSpaceOnUse"
							patternTransform="rotate({index * 28})"
						>
							<rect width="6" height="6" fill={color} opacity="0.85" />
							<path d="M 0 0 L 6 6" stroke="white" stroke-opacity="0.35" stroke-width="1" />
						</pattern>
					{/each}
				</defs>
				{#if mark !== "donut"}
					{#each ticks as tick (tick)}
						<line
							x1={padL}
							x2={padL + innerW}
							y1={y(tick)}
							y2={y(tick)}
							class="stroke-border"
							stroke-width="1"
						/>
						<text
							x={padL - 6}
							y={y(tick)}
							text-anchor="end"
							dominant-baseline="middle"
							class="fill-muted-foreground"
							font-size="10"
						>{formatTick(tick)}</text>
					{/each}
				{/if}
				{#if mark === "bar" || mark === "stacked"}
					{#each plot.categories as category, index (category.key)}
						{#if mark === "bar" && plot.series.length <= 1}
							{@const amount = plot.series[0]?.values[index] ?? 0}
							{@const top = y(amount)}
							{@const base = y(0)}
							{@const fill = colorByCategory.get(category.key) ?? colors[0]}
							<rect
								x={slots.x(index)}
								y={Math.min(top, base)}
								width={slots.bandwidth}
								height={Math.max(Math.abs(base - top), 1)}
								rx="3"
								fill={fill}
								opacity={hover && hover.text.startsWith(category.label) ? 1 : 0.92}
								role="presentation"
								onmouseenter={(event) => {
									hover = {
										x: event.offsetX,
										y: event.offsetY,
										text: `${category.label}: ${formatTick(amount)}`,
									};
								}}
							/>
						{:else}
							{#each plot.series as item, seriesIndex (item.key)}
								{@const amount = item.values[index] ?? 0}
								{@const start = offsets[index]?.[seriesIndex] ?? 0}
								{@const top = y(start + amount)}
								{@const base = y(start)}
								{@const fill = colorBySeries.get(item.key) ?? colors[seriesIndex]}
								{@const inner = band(plot.series.length, slots.x(index), slots.x(index) + slots.bandwidth, 0.12)}
								{@const x = mark === "stacked" ? slots.x(index) : inner.x(seriesIndex)}
								{@const w = mark === "stacked" ? slots.bandwidth : inner.bandwidth}
								<rect
									{x}
									y={Math.min(top, base)}
									width={w}
									height={Math.max(Math.abs(base - top), 1)}
									rx="2"
									fill={fill}
									role="presentation"
									onmouseenter={(event) => {
										hover = {
											x: event.offsetX,
											y: event.offsetY,
											text: `${category.label} · ${item.label}: ${formatTick(amount)}`,
										};
									}}
								/>
							{/each}
						{/if}
					{/each}
				{:else if mark === "line"}
					{#each plot.series as item, seriesIndex (item.key)}
						{@const points = plot.categories.map((category, index): [number, number] => [
							slots.x(index) + slots.bandwidth / 2,
							y(item.values[index] ?? 0),
						])}
						{@const fill = colorBySeries.get(item.key) ?? colors[seriesIndex]}
						<path d={areaPath(points, y(0))} fill={fill} opacity="0.12" />
						<path
							d={polyline(points)}
							fill="none"
							stroke={fill}
							stroke-width="2"
							stroke-linejoin="round"
							stroke-linecap="round"
						/>
						{#each points as point, index (index)}
							<circle
								cx={point[0]}
								cy={point[1]}
								r="3"
								fill={fill}
								role="presentation"
								onmouseenter={(event) => {
									hover = {
										x: event.offsetX,
										y: event.offsetY,
										text: `${plot.categories[index]?.label}: ${formatTick(item.values[index] ?? 0)}`,
									};
								}}
							/>
						{/each}
					{/each}
				{:else if mark === "donut" && donutTotal > 0}
					{@const cx = padL + innerW / 2}
					{@const cy = padT + innerH / 2}
					{@const outer = Math.min(innerW, innerH) / 2}
					{@const inner = outer * 0.62}
					{@const gap = 0.04}
					{#each plot.categories as category, index (category.key)}
						{@const amount = donutValues[index] ?? 0}
						{@const startBase = donutValues.slice(0, index).reduce((sum, n) => sum + n, 0) / donutTotal}
						{@const span = amount / donutTotal}
						{@const start = -Math.PI / 2 + startBase * Math.PI * 2 + gap / 2}
						{@const end = -Math.PI / 2 + (startBase + span) * Math.PI * 2 - gap / 2}
						{@const fill = colorByCategory.get(category.key) ?? colors[index]}
						<path
							d={donutSlice(cx, cy, outer, inner, start, end)}
							fill={fill}
							role="presentation"
							onmouseenter={(event) => {
								hover = {
									x: event.offsetX,
									y: event.offsetY,
									text: `${category.label}: ${formatTick(amount)}`,
								};
							}}
						/>
					{/each}
					<text
						x={cx}
						y={cy - 6}
						text-anchor="middle"
						class="fill-muted-foreground"
						font-size="11"
					>Total</text>
					<text
						x={cx}
						y={cy + 10}
						text-anchor="middle"
						class="fill-foreground"
						font-size="16"
						font-weight="600"
					>{formatTick(donutTotal)}</text>
				{/if}
				{#if mark !== "donut"}
					{#each plot.categories as category, index (category.key)}
						{#if plot.categories.length <= 8 || index % Math.ceil(plot.categories.length / 8) === 0}
							<text
								x={slots.x(index) + slots.bandwidth / 2}
								y={height - 8}
								text-anchor="middle"
								class="fill-muted-foreground"
								font-size="10"
							>{category.label.length > 10 ? `${category.label.slice(0, 9)}…` : category.label}</text>
						{/if}
					{/each}
				{/if}
			</svg>
			{#if hover}
				<div
					class="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
					style="left: {Math.min(hover.x + 8, width - 8)}px; top: {Math.max(hover.y - 28, 4)}px"
				>
					{hover.text}
				</div>
			{/if}
		{/snippet}
	</ChartPlot>
</ChartFrame>
