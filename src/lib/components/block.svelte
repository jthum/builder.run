<script lang="ts">
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import type { PageContext, PageNode } from "$lib/blocks/presentation.ts";
	import { loadBlock } from "$lib/blocks/registry.ts";

	let {
		node,
		rows,
		ready = true,
		spec,
	}: {
		node: PageNode;
		rows: Record<string, Array<Record<string, unknown>>>;
		ready?: boolean;
		spec?: PageContext;
	} = $props();

	const blockKey = $derived(node.kind === "block" ? node.block : "");
	const config = $derived(node.kind === "block" ? (node.config ?? {}) : {});
</script>

{#key blockKey}
	{#await loadBlock(blockKey)}
		<div class="flex min-h-24 flex-col gap-3">
			<Skeleton class="h-5 w-32" />
			<Skeleton class="min-h-16 w-full flex-1" />
		</div>
	{:then Component}
		{#if Component}
			<Component {config} {rows} {ready} {spec} />
		{:else if blockKey}
			<p class="text-sm text-muted-foreground">Block “{blockKey}” is not installed.</p>
		{/if}
	{:catch}
		<p class="text-sm text-destructive">This block could not be loaded.</p>
	{/await}
{/key}
