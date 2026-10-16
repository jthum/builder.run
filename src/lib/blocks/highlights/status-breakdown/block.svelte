<script lang="ts">
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import { session } from "$lib/app/session.svelte.ts";
	import { toneFromAccent } from "$lib/app/color.ts";
	import { formatCell } from "$lib/app/labels.ts";
	import { chartPalette } from "$lib/runtime/chart-geometry.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import { statusBreakdown } from "./data.ts";

	let { config, rows, spec, ready = true }: BlockProps = $props();
	const view = $derived(spec?.views.find((item) => item.key === config.view));
	const breakdown = $derived(view ? statusBreakdown(view, rows[view.key] ?? [], String(config.status_field ?? ""), String(config.value_field ?? "")) : { total: 0, groups: [] });
	const colors = $derived(chartPalette(toneFromAccent(session.accent).hue, Math.max(1, breakdown.groups.length)));
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0">
			<Card.Title>{String(config.title || view.label)}</Card.Title>
			{#if config.description}<Card.Description>{String(config.description)}</Card.Description>{/if}
		</Card.Header>
		<Card.Content class="flex flex-col justify-center gap-5">
			{#if !ready}
				<Skeleton class="h-8 w-24" /><Skeleton class="h-3 w-full" /><Skeleton class="h-16 w-full" />
			{:else if !breakdown.total}
				<Empty.Root><Empty.Header><Empty.Title>No values to show</Empty.Title><Empty.Description>Values from this View will appear here.</Empty.Description></Empty.Header></Empty.Root>
			{:else}
				<p class="flex items-baseline gap-2"><span class="text-3xl font-semibold tracking-tight tabular-nums">{breakdown.total.toLocaleString()}</span><span class="text-sm text-muted-foreground">total</span></p>
				<div class="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
					{#each breakdown.groups as group, index (group.label)}
						{#if group.percent > 0}<span style:width={`${group.percent}%`} style:background={colors[index]}></span>{/if}
					{/each}
				</div>
				<ul class="flex flex-col gap-3">
					{#each breakdown.groups as group, index (group.label)}
						<li class="flex items-center gap-2.5 text-sm">
							<span class="size-2 shrink-0 rounded-full" style:background={colors[index]} aria-hidden="true"></span>
							<span class="min-w-0 flex-1 truncate">{formatCell("category", group.label)}</span>
							<span class="font-medium tabular-nums">{group.value.toLocaleString()}</span>
							<span class="w-14 text-right text-xs text-muted-foreground tabular-nums">{group.percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
