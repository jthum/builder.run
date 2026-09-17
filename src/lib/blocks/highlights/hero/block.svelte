<script lang="ts">
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	let { config }: BlockProps = $props();
	const primaryLabel = $derived(String(config.primary_label ?? "").trim());
	const primaryHref = $derived(String(config.primary_href ?? "").trim());
	const secondaryLabel = $derived(String(config.secondary_label ?? "").trim());
	const secondaryHref = $derived(String(config.secondary_href ?? "").trim());
</script>

<Card.Root class="h-full">
	<Card.Content class="flex min-h-60 flex-col justify-between gap-8 p-7 sm:p-9">
		<div class="flex items-start justify-between gap-4">
			<div class="flex max-w-3xl flex-col gap-3">
				{#if config.eyebrow}<p class="text-xs font-semibold tracking-wider text-primary uppercase">{String(config.eyebrow)}</p>{/if}
				<h2 class="text-3xl font-semibold tracking-tight sm:text-4xl">{String(config.title ?? "Welcome")}</h2>
				{#if config.description}<p class="max-w-2xl text-base leading-relaxed text-muted-foreground">{String(config.description)}</p>{/if}
			</div>
			{#if config.badge}<Badge variant="secondary">{String(config.badge)}</Badge>{/if}
		</div>
		{#if (primaryLabel && primaryHref) || (secondaryLabel && secondaryHref)}
			<div class="flex flex-wrap gap-2">
				{#if primaryLabel && primaryHref}<Button href={primaryHref}>{primaryLabel}<ArrowRightIcon data-icon="inline-end" /></Button>{/if}
				{#if secondaryLabel && secondaryHref}<Button href={secondaryHref} variant="outline">{secondaryLabel}</Button>{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
