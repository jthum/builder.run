<script lang="ts">
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Progress } from "$lib/components/ui/progress/index.js";
	import { asNumber, cellValue } from "$lib/runtime/chart-data.ts";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import ArrowDownRightIcon from "@lucide/svelte/icons/arrow-down-right";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";

	let { config, rows, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const field = $derived(String(config.value ?? ""));
	const current = $derived(total(rows[viewKey] ?? [], field));
	const comparisonKey = $derived(String(config.comparison_view ?? ""));
	const comparisonField = $derived(String(config.comparison_value || field));
	const hasTarget = $derived(typeof config.target === "number" && Number.isFinite(config.target));
	const hasComparison = $derived(Boolean(comparisonKey));
	const reference = $derived(
		hasComparison
			? total(rows[comparisonKey] ?? [], comparisonField)
			: hasTarget
				? Number(config.target)
				: undefined,
	);
	const ratio = $derived(reference && reference !== 0 ? (current / reference) * 100 : undefined);
	const delta = $derived(hasComparison && ratio !== undefined ? ratio - 100 : undefined);

	function total(items: Array<Record<string, unknown>>, path: string): number {
		return path
			? items.reduce((sum, item) => sum + asNumber(cellValue(item, path)), 0)
			: items.length;
	}
</script>

{#if view}
	<Card.Root class="h-full">
		<Card.Header class="gap-0">
			<Card.Title>{String(config.title || view.label)}</Card.Title>
			{#if config.description}<Card.Description>{String(config.description)}</Card.Description>{/if}
			{#if delta !== undefined}
				<Card.Action>
					<Badge variant={delta >= 0 ? "default" : "destructive"}>
						{#if delta >= 0}<ArrowUpRightIcon />{:else}<ArrowDownRightIcon />{/if}
						{Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}%
					</Badge>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col justify-center gap-5">
			<div class="flex items-end justify-between gap-4">
				<p class="text-3xl font-semibold tracking-tight tabular-nums">
					<FormattedValue path={field} value={current} {type} maximumFractionDigits={1} />
				</p>
				{#if reference !== undefined}
					<p class="text-sm text-muted-foreground">
						<span class="font-medium text-foreground"><FormattedValue path={comparisonField} value={reference} {type} maximumFractionDigits={1} /></span>
						{String(config.reference_label || (hasComparison ? "comparison" : "target"))}
					</p>
				{/if}
			</div>
			{#if !hasComparison && ratio !== undefined}<Progress value={Math.min(100, ratio)} max={100} />{/if}
		</Card.Content>
	</Card.Root>
{:else}
	<p class="text-sm text-muted-foreground">Pick a view for this block.</p>
{/if}
