<script lang="ts">
	import PageWidget from "$lib/components/page-widget.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import type { WidgetDef } from "$lib/runtime/widgets.ts";
	import { cn } from "$lib/utils.ts";
	import { loadWidgetPreview } from "$lib/widgets/registry.ts";

	let { widget, wide = false, tall = false }: { widget: WidgetDef; wide?: boolean; tall?: boolean } = $props();
	const block = $derived({ kind: "widget", widget: widget.key } satisfies PageBlock);
</script>

<Card.Root class={cn("h-auto", wide && "xl:col-span-2")}>
	<Card.Header class="gap-0">
		<Card.Title>{widget.label}</Card.Title>
		<Card.Description>{widget.description}</Card.Description>
		<Card.Action><Badge variant="outline">{widget.key}</Badge></Card.Action>
	</Card.Header>
	<Card.Content class={tall ? "min-h-80" : "min-h-24"}>
		{#await loadWidgetPreview(widget.key)}
			<div class="flex min-h-24 flex-col gap-3">
				<Skeleton class="h-5 w-32" />
				<Skeleton class="min-h-16 w-full flex-1" />
			</div>
		{:then preview}
			{#if preview}
				<div inert class="h-full">
					<PageWidget
						block={{ ...block, values: preview.values }}
						rows={preview.rows ?? {}}
						ready
						previewSpec={preview.spec}
					/>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No preview has been provided for this widget.</p>
			{/if}
		{:catch}
			<p class="text-sm text-destructive">This preview could not be loaded.</p>
		{/await}
	</Card.Content>
</Card.Root>
