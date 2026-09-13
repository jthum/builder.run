<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import { cellValue } from "$lib/runtime/chart-data.ts";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";

	let { values, rows, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const titleField = $derived(String(values.title_field ?? ""));
	const descriptionField = $derived(String(values.description_field ?? ""));
	const dateField = $derived(String(values.date_field ?? ""));
	const statusField = $derived(String(values.status_field ?? ""));
	const limit = $derived(Math.max(1, Math.min(30, Number(values.limit) || 8)));
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
			<Card.Title>{String(values.title || view.label)}</Card.Title>
			<Card.Description>{String(values.description || `${items.length} dated ${items.length === 1 ? "record" : "records"}`)}</Card.Description>
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
	<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>
{/if}
