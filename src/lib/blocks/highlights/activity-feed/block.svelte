<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const titleField = $derived(String(config.title_field ?? view?.fields[0] ?? "id"));
	const descriptionField = $derived(String(config.description_field ?? ""));
	const dateField = $derived(String(config.date_field ?? "created_at"));
	const limit = $derived(Math.max(1, Math.min(20, Number(config.limit) || 5)));
	const items = $derived((rows[viewKey] ?? []).slice(0, limit));
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0"><Card.Title>{String(config.title || view.label)}</Card.Title><Card.Description>{items.length} recent {items.length === 1 ? "item" : "items"}</Card.Description></Card.Header>
		<Card.Content class="flex flex-col py-2">
			{#each items as item, index (String(item.id ?? index))}
				<a href={`/t/${view.source}/${item.id}`} class="group flex items-start gap-3 rounded-lg py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<div class="mt-1.5 size-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10"></div>
					<div class="min-w-0 flex-1"><p class="font-medium group-hover:underline"><FormattedValue path={titleField} value={item[titleField]} {type} /></p>{#if descriptionField}<p class="truncate text-sm text-muted-foreground"><FormattedValue path={descriptionField} value={item[descriptionField]} {type} /></p>{/if}</div>
					<span class="shrink-0 text-xs text-muted-foreground"><FormattedValue path={dateField} value={item[dateField]} {type} /></span>
				</a>
				{#if index < items.length - 1}<Separator />{/if}
			{/each}
		</Card.Content>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
