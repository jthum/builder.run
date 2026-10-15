<script lang="ts">
	import { listHref } from "$lib/app/labels.ts";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import { Progress } from "@jthum/framework/svelte/ui/progress";
	import { asNumber } from "$lib/runtime/chart-data.ts";
	import { viewCellValue } from "$lib/app/view-results.ts";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const target = $derived(Math.max(0, asNumber(config.target)));
	const total = $derived((rows[viewKey] ?? []).reduce((sum, row) => sum + (config.value ? asNumber(viewCellValue(view, row, String(config.value))) : 1), 0));
	const percent = $derived(target > 0 ? Math.min(100, Math.max(0, (total / target) * 100)) : 0);
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0"><Card.Title>{String(config.title || view.label)}</Card.Title>{#if config.description || ready}<Card.Description>{String(config.description || `${Math.round(percent)}% complete`)}</Card.Description>{/if}<Card.Action><Button href={listHref(view)} variant="ghost" size="icon-sm" aria-label={`Open ${view.label}`}><ArrowUpRightIcon /></Button></Card.Action></Card.Header>
		<Card.Content class="flex flex-col justify-center gap-4">
			{#if !ready}<Skeleton class="h-9 w-24" /><Skeleton class="h-2 w-full" />{:else}
			<div class="flex items-end justify-between gap-4"><p class="text-3xl font-semibold tracking-tight tabular-nums">{total.toLocaleString()}</p><p class="text-sm text-muted-foreground tabular-nums">of {target.toLocaleString()}</p></div>
			<Progress value={percent} max={100} />
			{/if}
		</Card.Content>
	</Card.Root>
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
