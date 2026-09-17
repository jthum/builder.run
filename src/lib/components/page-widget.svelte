<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import type { AppSpec, PageBlock } from "$lib/runtime/model.ts";
	import { loadWidgetRenderer } from "$lib/widgets/registry.ts";

	let {
		block,
		rows,
		ready = true,
		spec,
	}: {
		block: PageBlock;
		rows: Record<string, Array<Record<string, unknown>>>;
		ready?: boolean;
		spec?: AppSpec;
	} = $props();

	const widget = $derived(block.kind === "widget" ? block.widget : "");
	const values = $derived(block.kind === "widget" ? (block.values ?? {}) : {});
</script>

{#key widget}
	{#await loadWidgetRenderer(widget)}
		<div class="flex min-h-24 flex-col gap-3">
			<Skeleton class="h-5 w-32" />
			<Skeleton class="min-h-16 w-full flex-1" />
		</div>
	{:then Renderer}
		{#if Renderer}
			<Renderer {values} {rows} {ready} {spec} />
		{:else if widget}
			<p class="text-sm text-muted-foreground">Widget “{widget}” is not installed.</p>
		{/if}
	{:catch}
		<p class="text-sm text-destructive">This widget could not be loaded.</p>
	{/await}
{/key}
