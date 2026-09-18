<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import { asDayKey, cellValue } from "$lib/runtime/chart-data.ts";
	import type { CollectionDraft, ViewDraft } from "$lib/blocks/presentation.ts";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	let {
		view,
		type,
		title = "",
		dateField,
		rows,
		ready = true,
	}: {
		view: ViewDraft;
		type?: CollectionDraft;
		title?: string;
		dateField: string;
		rows: Array<Record<string, unknown>> | null;
		ready?: boolean;
	} = $props();

	const titleField = $derived(view.fields[0] ?? "id");
	let cursor = $state(new Date());
	const year = $derived(cursor.getFullYear());
	const month = $derived(cursor.getMonth());
	const label = $derived(cursor.toLocaleString(undefined, { month: "long", year: "numeric" }));
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, index) => {
			const day = new Date(2026, 5, index + 1);
			return day.toLocaleString(undefined, { weekday: "short" });
		}),
	);

	const cells = $derived.by(() => {
		const first = new Date(year, month, 1);
		const start = (first.getDay() + 6) % 7;
		const days = new Date(year, month + 1, 0).getDate();
		const total = Math.ceil((start + days) / 7) * 7;
		return Array.from({ length: total }, (_, index) => {
			const day = index - start + 1;
			if (day < 1 || day > days) return { key: `pad-${index}`, date: null as string | null, day: 0 };
			const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			return { key: iso, date: iso, day };
		});
	});

	const byDay = $derived.by(() => {
		const map = new Map<string, Array<Record<string, unknown>>>();
		for (const row of rows ?? []) {
			const key = asDayKey(cellValue(row, dateField));
			if (!key) continue;
			const list = map.get(key) ?? [];
			list.push(row);
			map.set(key, list);
		}
		return map;
	});

	const today = $derived(new Date().toISOString().slice(0, 10));
</script>

<Card.Root class="flex h-full min-h-96 flex-col overflow-hidden">
	<Card.Header class="flex-row items-center justify-between gap-2">
		<div class="flex flex-col gap-0.5">
			{#if title}
				<Card.Description>{title}</Card.Description>
			{/if}
			<Card.Title class="text-base">{label}</Card.Title>
		</div>
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon-sm" onclick={() => (cursor = new Date(year, month - 1, 1))}>
				<ChevronLeftIcon />
				<span class="sr-only">Previous month</span>
			</Button>
			<Button variant="ghost" size="icon-sm" onclick={() => (cursor = new Date(year, month + 1, 1))}>
				<ChevronRightIcon />
				<span class="sr-only">Next month</span>
			</Button>
		</div>
	</Card.Header>
	<Card.Content class="flex min-h-0 flex-1 flex-col gap-2 pt-0">
		{#if !ready}
			<Skeleton class="min-h-0 w-full flex-1" />
		{:else}
			<div class="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
				{#each weekdays as name, index (`${name}-${index}`)}
					<div class="py-1">{name}</div>
				{/each}
			</div>
			<div class="grid min-h-0 flex-1 grid-cols-7 gap-1" style="grid-template-rows: repeat({cells.length / 7}, minmax(0, 1fr));">
				{#each cells as cell (cell.key)}
					{#if !cell.date}
						<div class="rounded-lg bg-muted/20"></div>
					{:else}
						{@const items = byDay.get(cell.date) ?? []}
						<div
							class="flex min-h-16 flex-col gap-1 overflow-hidden rounded-lg border p-1.5 {cell.date === today
								? 'border-primary'
								: 'border-transparent bg-muted/30'}"
						>
							<span class="text-xs font-medium tabular-nums">{cell.day}</span>
							<div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
								{#each items.slice(0, 3) as row (String(row.id ?? JSON.stringify(row)))}
									<a
										href="/t/{view.source}/{row.id}"
										class="truncate rounded-md bg-background px-1 py-0.5 text-[11px] hover:bg-muted"
									>
										<FormattedValue path={titleField} value={row[titleField]} {type} />
									</a>
								{/each}
								{#if items.length > 3}
									<span class="text-[11px] text-muted-foreground">+{items.length - 3}</span>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
