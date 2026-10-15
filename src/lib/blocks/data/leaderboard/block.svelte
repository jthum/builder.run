<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import { Progress } from "@jthum/framework/svelte/ui/progress";
	import { asNumber } from "$lib/runtime/chart-data.ts";
	import { viewCellValue, viewReferenceHref } from "$lib/app/view-results.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";

	let { config, rows, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const labelField = $derived(String(config.label_field ?? ""));
	const valueField = $derived(String(config.value_field ?? ""));
	const detailField = $derived(String(config.detail_field ?? ""));
	const limit = $derived(Math.max(1, Math.min(20, Number(config.limit) || 5)));
	const ranked = $derived(
		[...(rows[viewKey] ?? [])]
			.sort((left, right) => asNumber(viewCellValue(view, right, valueField)) - asNumber(viewCellValue(view, left, valueField)))
			.slice(0, limit),
	);
	const maximum = $derived(Math.max(...ranked.map((item) => asNumber(viewCellValue(view, item, valueField))), 1));
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0">
			<Card.Title>{String(config.title || view.label)}</Card.Title>
			<Card.Description>{ranked.length} ranked {ranked.length === 1 ? "record" : "records"}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col py-2">
			{#each ranked as item, index (String(item.id ?? index))}
				<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl px-1 py-3">
					<Badge variant={index < 3 ? "secondary" : "outline"}>{index + 1}</Badge>
					<div class="min-w-0">
						<p class="truncate"><FormattedValue path={labelField} value={viewCellValue(view, item, labelField)} {type} href={`/t/${view.source}/${item.id}`} /></p>
						{#if detailField}<p class="truncate text-sm text-muted-foreground"><FormattedValue path={detailField} value={viewCellValue(view, item, detailField)} {type} href={viewReferenceHref(view, item, detailField, spec?.types ?? [])} /></p>{/if}
					</div>
					<p class="font-medium tabular-nums"><FormattedValue path={valueField} value={viewCellValue(view, item, valueField)} {type} maximumFractionDigits={1} /></p>
					<div class="col-start-2 col-end-4"><Progress value={(asNumber(viewCellValue(view, item, valueField)) / maximum) * 100} max={100} class="h-1.5" /></div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
