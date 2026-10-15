<script lang="ts">
	import type { ViewDraft } from "@jthum/framework/svelte/authoring/data";
	import { viewCellValue } from "$lib/app/view-results.ts";
	import { toneFromAccent } from "$lib/app/color.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import { asNumber, groupChart, sparkline } from "$lib/runtime/chart-data.ts";
	import { areaPath, chartPalette, linear, polyline } from "$lib/runtime/chart-geometry.ts";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";

	let {
		title,
		rows,
		view,
		value = "",
		date = "created_at",
		description = "",
		context = "",
		ready = true,
		href,
	}: {
		title: string;
		rows: Array<Record<string, unknown>> | null;
		view: ViewDraft;
		value?: string;
		date?: string;
		description?: string;
		context?: string;
		ready?: boolean;
		href?: string;
	} = $props();

	const hue = $derived(toneFromAccent(session.accent).hue);
	const color = $derived(chartPalette(hue, 1)[0] ?? "currentColor");
	const total = $derived.by(() => {
		if (!rows) return 0;
		if (!value) return rows.length;
		return rows.reduce((sum, row) => sum + asNumber(viewCellValue(view, row, value)), 0);
	});
	const trend = $derived.by(() => {
		if (!rows?.length) return [];
		return sparkline(groupChart(rows, { category: date || "created_at", value: value || undefined, time: true }, (row, path) => viewCellValue(view, row, path)));
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
	const supportingText = $derived(description.trim() || context.trim());
</script>

<Card.Root class="h-full">
	<Card.Header>
		<span class="text-sm font-medium text-muted-foreground">{title}</span>
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
				{#if ready && supportingText}<p class="text-xs text-muted-foreground">{supportingText}</p>{/if}
		</div>
		{#if ready && points}
			<svg viewBox="0 0 120 40" class="h-12 w-28 shrink-0" aria-hidden="true">
				<path d={area} fill={color} fill-opacity="0.1" />
				<path d={points} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
			</svg>
		{/if}
	</Card.Content>
</Card.Root>
