<script lang="ts">
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { asDayKey, asNumber, cellValue } from "$lib/runtime/chart-data.ts";
	import { cn } from "$lib/utils.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const dateField = $derived(String(config.date ?? ""));
	const valueField = $derived(String(config.value ?? ""));
	const amounts = $derived.by(() => {
		const result = new Map<string, number>();
		for (const item of rows[viewKey] ?? []) {
			const day = asDayKey(cellValue(item, dateField));
			if (!day) continue;
			result.set(day, (result.get(day) ?? 0) + (valueField ? asNumber(cellValue(item, valueField)) : 1));
		}
		return result;
	});
	const cells = $derived(calendarCells(amounts));
	const maximum = $derived(Math.max(...cells.map((cell) => cell.value), 1));

	function calendarCells(valuesByDay: Map<string, number>) {
		const keys = [...valuesByDay.keys()].sort();
		const latest = keys.at(-1) ? new Date(`${keys.at(-1)}T00:00:00Z`) : new Date();
		const end = new Date(latest);
		end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
		const start = new Date(end);
		start.setUTCDate(start.getUTCDate() - 55);
		return Array.from({ length: 56 }, (_, index) => {
			const date = new Date(start);
			date.setUTCDate(start.getUTCDate() + index);
			const key = date.toISOString().slice(0, 10);
			return { key, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }), value: valuesByDay.get(key) ?? 0 };
		});
	}

	function tone(value: number): string {
		if (!value) return "bg-muted";
		const ratio = value / maximum;
		if (ratio <= 0.25) return "bg-primary/25";
		if (ratio <= 0.5) return "bg-primary/45";
		if (ratio <= 0.75) return "bg-primary/70";
		return "bg-primary";
	}
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0"><Card.Title>{String(config.title || view.label)}</Card.Title><Card.Description>Eight weeks of activity</Card.Description></Card.Header>
		<Card.Content class="flex min-h-0 flex-1 flex-col justify-center gap-4">
			{#if !ready}
				<Skeleton class="min-h-40 w-full" />
			{:else}
				<div class="grid grid-flow-col grid-rows-7 gap-1.5" aria-label="Activity by day">
					{#each cells as cell (cell.key)}
						<div class={cn("aspect-square min-w-2 rounded-sm", tone(cell.value))} title={`${cell.label}: ${cell.value.toLocaleString()}`} aria-label={`${cell.label}: ${cell.value.toLocaleString()}`}></div>
					{/each}
				</div>
				<div class="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><span>Less</span>{#each ["bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"] as item (item)}<span class={cn("size-3 rounded-sm", item)}></span>{/each}<span>More</span></div>
			{/if}
		</Card.Content>
	</Card.Root>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
