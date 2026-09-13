<script lang="ts">
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	let { values }: WidgetRendererProps = $props();
	const primaryLabel = $derived(String(values.primary_label ?? "").trim());
	const primaryHref = $derived(String(values.primary_href ?? "").trim());
	const secondaryLabel = $derived(String(values.secondary_label ?? "").trim());
	const secondaryHref = $derived(String(values.secondary_href ?? "").trim());
</script>

<Card.Root class="h-full">
	<Card.Content class="flex min-h-60 flex-col justify-between gap-8 p-7 sm:p-9">
		<div class="flex items-start justify-between gap-4">
			<div class="flex max-w-3xl flex-col gap-3">
				{#if values.eyebrow}<p class="text-xs font-semibold tracking-wider text-primary uppercase">{String(values.eyebrow)}</p>{/if}
				<h2 class="text-3xl font-semibold tracking-tight sm:text-4xl">{String(values.title ?? "Welcome")}</h2>
				{#if values.description}<p class="max-w-2xl text-base leading-relaxed text-muted-foreground">{String(values.description)}</p>{/if}
			</div>
			{#if values.badge}<Badge variant="secondary">{String(values.badge)}</Badge>{/if}
		</div>
		{#if (primaryLabel && primaryHref) || (secondaryLabel && secondaryHref)}
			<div class="flex flex-wrap gap-2">
				{#if primaryLabel && primaryHref}<Button href={primaryHref}>{primaryLabel}<ArrowRightIcon data-icon="inline-end" /></Button>{/if}
				{#if secondaryLabel && secondaryHref}<Button href={secondaryHref} variant="outline">{secondaryLabel}</Button>{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
