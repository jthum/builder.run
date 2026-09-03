<script lang="ts">
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import type { Snippet } from "svelte";

	let {
		title,
		ready = true,
		empty = false,
		legend = [],
		hidden = new Set<string>(),
		onToggle,
		children,
	}: {
		title: string;
		ready?: boolean;
		empty?: boolean;
		legend?: Array<{ key: string; label: string; color: string }>;
		hidden?: Set<string>;
		onToggle?: (key: string) => void;
		children?: Snippet;
	} = $props();
</script>

<Card.Root class="flex h-full min-h-72 flex-col overflow-hidden">
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
			{#if legend.length}
				<ul class="flex shrink-0 flex-wrap gap-x-3 gap-y-1">
					{#each legend as item (item.key)}
						<li>
							<button
								type="button"
								class="flex items-center gap-1.5 text-xs {hidden.has(item.key)
									? 'text-muted-foreground line-through'
									: 'text-foreground'}"
								onclick={() => onToggle?.(item.key)}
							>
								<span
									class="size-2.5 shrink-0 rounded-sm"
									style="background: {item.color}"
								></span>
								{item.label}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
