<script lang="ts">
	import { onMount } from "svelte";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { viewCellValue, viewReferenceHref } from "$lib/app/view-results.ts";
	import { recordHref } from "$lib/blocks/links.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import { agendaGroups } from "./data.ts";

	let { config, rows, spec, ready = true }: BlockProps = $props();
	let now = $state(new Date());
	const view = $derived(spec?.views.find((item) => item.key === config.view));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const titleField = $derived(String(config.title_field ?? ""));
	const detailField = $derived(String(config.description_field ?? ""));
	const groups = $derived(view ? agendaGroups(view, rows[view.key] ?? [], String(config.date_field ?? ""), now, Number(config.limit ?? 8)) : []);

	// Keep Today accurate for a page left open overnight, without a polling clock.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout>;
		function schedule() {
			const current = new Date();
			const midnight = new Date(current);
			midnight.setHours(24, 0, 0, 0);
			timer = setTimeout(() => { now = new Date(); schedule(); }, midnight.getTime() - current.getTime());
		}
		schedule();
		return () => clearTimeout(timer);
	});
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0">
			<Card.Title>{String(config.title || view.label)}</Card.Title>
			{#if config.description}<Card.Description>{String(config.description)}</Card.Description>{/if}
		</Card.Header>
		<Card.Content class="flex flex-col gap-6">
			{#if !ready}
				{#each [0, 1, 2] as index (index)}<Skeleton class="h-14 w-full" />{/each}
			{:else if !groups.length}
				<Empty.Root><Empty.Header><Empty.Title>Nothing on the agenda</Empty.Title><Empty.Description>Dated items from this View will appear here.</Empty.Description></Empty.Header></Empty.Root>
			{:else}
				{#each groups as group (group.label)}
					<section class="flex flex-col gap-3" aria-label={group.label}>
						<h3 class="text-xs font-medium tracking-wide text-muted-foreground">{group.label}</h3>
						<ul class="flex flex-col gap-4">
							{#each group.items as item (item.index)}
								<li class="flex items-start gap-3">
									<time datetime={item.instant ? item.date.toISOString() : item.day} class="flex w-11 shrink-0 flex-col items-center rounded-xl bg-primary/5 py-2 text-primary">
										<span class="text-[10px] font-medium uppercase">{item.date.toLocaleDateString(undefined, { month: "short" })}</span>
										<span class="text-lg leading-tight font-semibold tabular-nums">{item.date.getDate()}</span>
									</time>
									<div class="flex min-w-0 flex-1 flex-col gap-1 pt-1">
										<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
											<p class="font-medium"><FormattedValue path={titleField} value={viewCellValue(view, item.row, titleField)} {type} href={recordHref(view, item.row)} /></p>
											{#if item.instant}<span class="text-xs text-muted-foreground tabular-nums">{item.date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>{/if}
										</div>
										{#if detailField}<p class="truncate text-sm text-muted-foreground"><FormattedValue path={detailField} value={viewCellValue(view, item.row, detailField)} {type} href={viewReferenceHref(view, item.row, detailField, spec?.types ?? [])} /></p>{/if}
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</Card.Content>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
