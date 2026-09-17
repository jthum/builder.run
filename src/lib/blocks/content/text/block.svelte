<script lang="ts">
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config }: BlockProps = $props();
</script>

<p class="max-w-2xl whitespace-pre-wrap text-muted-foreground">{String(config.text ?? "")}</p>
