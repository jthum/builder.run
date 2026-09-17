<script lang="ts">
	import CalloutBlock from "$lib/components/callout-block.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config }: BlockProps = $props();
</script>

<CalloutBlock title={String(config.title ?? "Note")} text={String(config.text ?? "")} tone={String(config.tone ?? "note")} />
