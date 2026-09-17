<script lang="ts">
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config }: BlockProps = $props();
</script>

<div class="flex flex-col gap-1">
	<h2 class="text-lg font-medium">{String(config.title ?? "Heading")}</h2>
	{#if config.description}<p class="max-w-2xl text-muted-foreground">{String(config.description)}</p>{/if}
</div>
