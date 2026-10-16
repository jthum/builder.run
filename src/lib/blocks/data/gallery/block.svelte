<script lang="ts">
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import ImageIcon from "@lucide/svelte/icons/image";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { viewCellValue, viewReferenceHref } from "$lib/app/view-results.ts";
	import { recordHref, webHref } from "$lib/blocks/links.ts";
	import { scalarString } from "$lib/runtime/values.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, spec, ready = true }: BlockProps = $props();
	let failed = $state(new Set<string>());
	const view = $derived(spec?.views.find((item) => item.key === config.view));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const titleField = $derived(String(config.title_field ?? ""));
	const detailField = $derived(String(config.description_field ?? ""));
	const limit = $derived(Number.isFinite(Number(config.limit)) ? Math.max(1, Math.min(30, Math.floor(Number(config.limit)))) : 6);
	const items = $derived(view ? (rows[view.key] ?? []).slice(0, limit).map((row, index) => ({ row, index, src: webHref(viewCellValue(view, row, String(config.image_field ?? ""))), title: viewCellValue(view, row, titleField), href: recordHref(view, row) })) : []);
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0">
			<Card.Title>{String(config.title || view.label)}</Card.Title>
			{#if config.description}<Card.Description>{String(config.description)}</Card.Description>{/if}
		</Card.Header>
		<Card.Content>
			{#if !ready}
				<div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-5">{#each [0, 1, 2] as index (index)}<Skeleton class="aspect-[4/3] w-full" />{/each}</div>
			{:else if !items.length}
				<Empty.Root><Empty.Header><Empty.Title>No images yet</Empty.Title><Empty.Description>Records from this View will appear here.</Empty.Description></Empty.Header></Empty.Root>
			{:else}
				<ul class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-x-5 gap-y-6">
					{#each items as item (item.index)}
						<li class="min-w-0">
							<figure class="flex flex-col gap-3">
								<svelte:element this={item.href ? "a" : "div"} href={item.href} class="block overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={item.href ? `Open ${scalarString(item.title) || "record"}` : undefined}>
									{#if item.src && !failed.has(item.src)}
										<img src={item.src} alt={scalarString(item.title) || "Record image"} loading="lazy" decoding="async" referrerpolicy="no-referrer" class="aspect-[4/3] w-full bg-muted object-cover" onerror={() => { failed = new Set([...failed, item.src!]); }} />
									{:else}
										<div class="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-muted text-muted-foreground"><ImageIcon class="size-6" aria-hidden="true" /><span class="text-xs">Image unavailable</span></div>
									{/if}
								</svelte:element>
								<figcaption class="flex min-w-0 flex-col gap-1">
									<p class="truncate font-medium"><FormattedValue path={titleField} value={item.title} {type} href={item.href} /></p>
									{#if detailField}<p class="truncate text-sm text-muted-foreground"><FormattedValue path={detailField} value={viewCellValue(view, item.row, detailField)} {type} href={viewReferenceHref(view, item.row, detailField, spec?.types ?? [])} /></p>{/if}
								</figcaption>
							</figure>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
