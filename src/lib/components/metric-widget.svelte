<script lang="ts">
	import { toneFromName } from "$lib/app/color.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { asNumber, cellValue, groupChart, sparkline } from "$lib/runtime/chart-data.ts";
	import { chartPalette, linear, polyline } from "$lib/runtime/chart-geometry.ts";

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
	const points = $derived.by(() => {
		if (!trend.length) return "";
		const max = Math.max(...trend, 1);
		const y = linear([0, max], [28, 4]);
		const step = trend.length === 1 ? 0 : 120 / (trend.length - 1);
		const plotted =
			trend.length === 1
				? ([
						[8, y(trend[0] ?? 0)],
						[112, y(trend[0] ?? 0)],
					] as Array<[number, number]>)
				: trend.map((item, index) => [index * step, y(item)] as [number, number]);
		return polyline(plotted);
	});
	const count = $derived(rows?.length ?? 0);
</script>

<Card.Root class="h-full min-h-32">
	<Card.Content class="flex h-full flex-col justify-between gap-3 p-5">
		<div class="flex items-start justify-between gap-3">
			<div class="flex flex-col gap-1">
				<p class="text-sm text-muted-foreground">{title}</p>
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
				<svg viewBox="0 0 120 32" class="h-8 w-24 shrink-0" aria-hidden="true">
					<path d={points} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
				</svg>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
