<script lang="ts">
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import type { Snippet } from "svelte";
	import * as Collapsible from "@jthum/framework/svelte/ui/collapsible";
	import * as Table from "@jthum/framework/svelte/ui/table";
	import ChartSwatch from "./chart-swatch.svelte";
	import type { ChartInteraction } from "$lib/runtime/chart-interaction.svelte.ts";
	import { cn } from "$lib/utils.ts";
	import "./chart-interaction.css";

	let {
		title,
		ready = true,
		empty = false,
		legend = [],
		hidden = new Set<string>(),
		onToggle,
		interaction,
		data,
		children,
	}: {
		title: string;
		ready?: boolean;
		empty?: boolean;
		legend?: Array<{ key: string; label: string; color: string; index: number; line?: boolean; plain?: boolean; text?: string }>;
		hidden?: Set<string>;
		onToggle?: (key: string) => void;
		interaction?: ChartInteraction;
		data?: { columns: string[]; rows: Array<Array<string | number>> };
		children?: Snippet;
	} = $props();
	let dataOpen = $state(false);
</script>

<Card.Root class="chart-frame flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden" aria-busy={!ready}>
	<Card.Header class="shrink-0">
		<Card.Title class="text-base">{title}</Card.Title>
	</Card.Header>
	<Card.Content class="flex min-h-0 flex-1 flex-col gap-3">
		{#if !ready}
			<Skeleton class="min-h-0 w-full flex-1" />
		{:else if empty}
			<Empty.Root class="min-h-0 flex-1 border-0 py-6">
				<Empty.Header>
					<Empty.Media variant="icon"><InboxIcon /></Empty.Media>
					<Empty.Title>Nothing to chart yet</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="flex min-h-0 w-full flex-1 flex-col px-1 pb-1">
				{@render children?.()}
			</div>
			{#if interaction}
				<p class="min-h-5 text-xs text-muted-foreground" aria-hidden="true">{interaction.active?.text ?? "Hover or focus to explore"}</p>
			{/if}
			{#if legend.length}
				<ul class="flex shrink-0 flex-wrap gap-1" aria-label={`${title} legend`}>
					{#each legend as item (item.key)}
						<li>
							<button
								type="button"
								class={cn("flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring", hidden.has(item.key) && "text-muted-foreground line-through")}
								data-chart-legend
								aria-pressed={onToggle ? !hidden.has(item.key) : undefined}
								aria-label={item.label}
								title={`${hidden.has(item.key) ? "Show" : "Hide"} ${item.label}`}
								{...interaction?.events({ id: `legend:${item.key}`, key: item.key, text: item.text ?? item.label })}
								{...interaction?.state(item.key)}
								onclick={() => onToggle?.(item.key)}
							>
								<ChartSwatch color={item.color} index={item.index} line={item.line} plain={item.plain} />
								{item.label}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if data}
				<Collapsible.Root bind:open={dataOpen}>
					<Collapsible.Trigger class="rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">View chart data</Collapsible.Trigger>
					<Collapsible.Content>
						{#if dataOpen}
							<div class="mt-3 max-h-64 overflow-auto">
								<Table.Root>
									<Table.Caption>{title} — all values, including hidden items</Table.Caption>
									<Table.Header><Table.Row>{#each data.columns as column, index (index)}<Table.Head scope="col">{column}</Table.Head>{/each}</Table.Row></Table.Header>
									<Table.Body>{#each data.rows as row, index (index)}<Table.Row>{#each row as value, column (column)}<Table.Cell>{value}</Table.Cell>{/each}</Table.Row>{/each}</Table.Body>
								</Table.Root>
							</div>
						{/if}
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
