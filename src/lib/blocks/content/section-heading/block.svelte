<script lang="ts">
	import { Button } from "@jthum/framework/svelte/ui/button";
	import { Separator } from "@jthum/framework/svelte/ui/separator";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	let { config }: BlockProps = $props();
	const label = $derived(String(config.action_label ?? "").trim());
	const href = $derived(String(config.action_href ?? "").trim());
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-end justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			{#if config.eyebrow}<p class="text-xs font-medium tracking-wide text-primary uppercase">{String(config.eyebrow)}</p>{/if}
			<h2 class="text-xl font-semibold tracking-tight">{String(config.title ?? "Section")}</h2>
			{#if config.description}<p class="max-w-2xl text-sm text-muted-foreground">{String(config.description)}</p>{/if}
		</div>
		{#if label && href}<Button variant="ghost" size="sm" {href}>{label}<ArrowRightIcon data-icon="inline-end" /></Button>{/if}
	</div>
	<Separator />
</div>
