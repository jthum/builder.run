<script lang="ts">
	import * as Card from "@jthum/framework/svelte/ui/card";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";
	import type { BlockProps } from "$lib/blocks/types.ts";
	import { webHref } from "$lib/blocks/links.ts";

	let { config }: BlockProps = $props();
	const href = $derived(webHref(config.href));
</script>

<Card.Root class="relative h-full">
	<Card.Header class="gap-0">
		{#if config.eyebrow}<p class="mb-1 text-xs font-medium tracking-wide text-muted-foreground">{String(config.eyebrow)}</p>{/if}
		<Card.Title>
			{#if href}
				<a {href} class="outline-none after:absolute after:inset-0 after:rounded-2xl hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring">{String(config.title || "Explore")}</a>
			{:else}{String(config.title || "Explore")}{/if}
		</Card.Title>
		<Card.Action><span class="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><ArrowUpRightIcon class="size-4" aria-hidden="true" /></span></Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col justify-between gap-4">
		{#if config.description}<p class="text-sm leading-relaxed text-muted-foreground">{String(config.description)}</p>{/if}
		<p class="text-xs font-medium text-primary">{href ? "Explore" : "Add a destination link"}</p>
	</Card.Content>
</Card.Root>
