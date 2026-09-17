<script lang="ts">
	import Block from "$lib/components/block.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import type { PageLayoutNode } from "$lib/runtime/model.ts";
	import type { BlockDefinition } from "$lib/runtime/blocks.ts";
	import { cn } from "$lib/utils.ts";
	import { loadBlockPreview } from "$lib/blocks/registry.ts";

	let { definition, wide = false, tall = false }: { definition: BlockDefinition; wide?: boolean; tall?: boolean } = $props();
	const node = $derived({ kind: "block", block: definition.key } satisfies PageLayoutNode);
</script>

<Card.Root class={cn("h-auto", wide && "xl:col-span-2")}>
	<Card.Header class="gap-0">
		<Card.Title>{definition.label}</Card.Title>
		<Card.Description>{definition.description}</Card.Description>
		<Card.Action><Badge variant="outline">{definition.key}</Badge></Card.Action>
	</Card.Header>
	<Card.Content class={tall ? "min-h-80" : "min-h-24"}>
		{#await loadBlockPreview(definition.key)}
			<div class="flex min-h-24 flex-col gap-3">
				<Skeleton class="h-5 w-32" />
				<Skeleton class="min-h-16 w-full flex-1" />
			</div>
		{:then preview}
			{#if preview}
				<div inert class="h-full">
					<Block
						node={{ ...node, config: preview.config }}
						rows={preview.rows ?? {}}
						ready
						spec={preview.spec}
					/>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No preview has been provided for this block.</p>
			{/if}
		{:catch}
			<p class="text-sm text-destructive">This preview could not be loaded.</p>
		{/await}
	</Card.Content>
</Card.Root>
