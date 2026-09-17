<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import { cellValue } from "$lib/runtime/chart-data.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const titleField = $derived(String(config.title_field ?? ""));
	const descriptionField = $derived(String(config.description_field ?? ""));
	const dateField = $derived(String(config.date_field ?? ""));
	const statusField = $derived(String(config.status_field ?? ""));
	const limit = $derived(Math.max(1, Math.min(30, Number(config.limit) || 8)));
	const items = $derived(
		[...(rows[viewKey] ?? [])]
			.sort((left, right) => timestamp(cellValue(left, dateField)) - timestamp(cellValue(right, dateField)))
			.slice(0, limit),
	);

	function timestamp(value: unknown): number {
		const time = new Date(String(value ?? "")).getTime();
		return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
	}
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0">
			<Card.Title>{String(config.title || view.label)}</Card.Title>
			<Card.Description>{String(config.description || `${items.length} dated ${items.length === 1 ? "record" : "records"}`)}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col py-2">
			{#each items as item, index (String(item.id ?? index))}
				<a href={`/t/${view.source}/${item.id}`} class="group grid grid-cols-[6.5rem_auto_minmax(0,1fr)_auto] gap-3 rounded-lg py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<p class="pt-0.5 text-sm text-muted-foreground"><FormattedValue path={dateField} value={item[dateField]} {type} /></p>
					<div class="relative flex justify-center">
						{#if index < items.length - 1}<span class="absolute top-3 bottom-[-1.5rem] w-px bg-border"></span>{/if}
						<span class="relative mt-1.5 size-2.5 rounded-full bg-primary ring-4 ring-primary/10"></span>
					</div>
					<div class="min-w-0">
						<p class="font-medium group-hover:underline"><FormattedValue path={titleField} value={item[titleField]} {type} /></p>
						{#if descriptionField}<p class="truncate text-sm text-muted-foreground"><FormattedValue path={descriptionField} value={item[descriptionField]} {type} /></p>{/if}
					</div>
					{#if statusField}<div><FormattedValue path={statusField} value={item[statusField]} {type} badge /></div>{/if}
				</a>
			{/each}
		</Card.Content>
	</Card.Root>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
