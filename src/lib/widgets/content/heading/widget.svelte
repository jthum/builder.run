<script lang="ts">
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values }: WidgetRendererProps = $props();
</script>

<div class="flex flex-col gap-1">
	<h2 class="text-lg font-medium">{String(values.title ?? "Heading")}</h2>
	{#if values.description}<p class="max-w-2xl text-muted-foreground">{String(values.description)}</p>{/if}
</div>
