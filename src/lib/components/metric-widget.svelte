<script lang="ts">
	import { toneFromName } from "$lib/app/color.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { asNumber, cellValue, groupChart, sparkline } from "$lib/runtime/chart-data.ts";
	import { areaPath, chartPalette, linear, polyline } from "$lib/runtime/chart-geometry.ts";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";
	import ChartNoAxesColumnIncreasingIcon from "@lucide/svelte/icons/chart-no-axes-column-increasing";

	let {
		title,
		rows,
		value = "",
		date = "created_at",
		ready = true,
		href,
	}: {
		title: string;
		rows: Array<Record<string, unknown>> | null;
		value?: string;
		date?: string;
		ready?: boolean;
		href?: string;
	} = $props();

	const hue = $derived(toneFromName(session.snapshot?.app.name ?? "app").hue);
	const color = $derived(chartPalette(hue, 1)[0] ?? "currentColor");
	const tone = $derived(toneFromName(session.snapshot?.app.name ?? "app"));
	const total = $derived.by(() => {
		if (!rows) return 0;
		if (!value) return rows.length;
		return rows.reduce((sum, row) => sum + asNumber(cellValue(row, value)), 0);
	});
	const trend = $derived.by(() => {
		if (!rows?.length) return [];
		return sparkline(groupChart(rows, { category: date || "created_at", value: value || undefined, time: true }));
	});
	const label = $derived(
		total >= 1000 && Number.isInteger(total) ? total.toLocaleString() : String(total),
	);
	const plotted = $derived.by(() => {
		if (!trend.length) return [] as Array<[number, number]>;
		const max = Math.max(...trend, 1);
		const y = linear([0, max], [36, 5]);
		const step = trend.length === 1 ? 0 : 120 / (trend.length - 1);
		return trend.length === 1
			? ([[8, y(trend[0] ?? 0)], [112, y(trend[0] ?? 0)]] as Array<[number, number]>)
			: trend.map((item, index) => [index * step, y(item)] as [number, number]);
	});
	const points = $derived(polyline(plotted));
	const area = $derived(areaPath(plotted, 40));
	const count = $derived(rows?.length ?? 0);
</script>

<Card.Root class="h-full">
	<Card.Header>
		<div class="flex items-center gap-2.5">
			<span
				class="flex size-7 items-center justify-center rounded-lg"
				style="background-color: color-mix(in oklab, {tone.accent} 12%, var(--background)); color: {tone.accent}"
			>
				<ChartNoAxesColumnIncreasingIcon />
			</span>
			<span class="text-sm font-medium text-muted-foreground">{title}</span>
		</div>
		{#if href}
			<Card.Action>
				<a href={href} aria-label={`Open ${title}`} class="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
					<ArrowUpRightIcon class="size-4" aria-hidden="true" />
				</a>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex min-h-24 items-center justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1.5">
				{#if !ready}
					<Skeleton class="h-8 w-20" />
				{:else if href}
					<a class="text-2xl font-medium tracking-tight hover:underline" {href}>{label}</a>
				{:else}
					<p class="text-2xl font-medium tracking-tight">{label}</p>
				{/if}
				{#if ready}
					<p class="text-xs text-muted-foreground">
						{count === 1 ? "1 record" : `${count} records`}{value ? ", summed" : ""}
					</p>
				{/if}
		</div>
		{#if ready && points}
			<svg viewBox="0 0 120 40" class="h-12 w-28 shrink-0" aria-hidden="true">
				<path d={area} fill={color} fill-opacity="0.1" />
				<path d={points} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
			</svg>
		{/if}
	</Card.Content>
</Card.Root>
