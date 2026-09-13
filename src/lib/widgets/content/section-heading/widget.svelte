<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	let { values }: WidgetRendererProps = $props();
	const label = $derived(String(values.action_label ?? "").trim());
	const href = $derived(String(values.action_href ?? "").trim());
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-end justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			{#if values.eyebrow}<p class="text-xs font-medium tracking-wide text-primary uppercase">{String(values.eyebrow)}</p>{/if}
			<h2 class="text-xl font-semibold tracking-tight">{String(values.title ?? "Section")}</h2>
			{#if values.description}<p class="max-w-2xl text-sm text-muted-foreground">{String(values.description)}</p>{/if}
		</div>
		{#if label && href}<Button variant="ghost" size="sm" {href}>{label}<ArrowRightIcon data-icon="inline-end" /></Button>{/if}
	</div>
	<Separator />
</div>
