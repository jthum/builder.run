<script lang="ts">
	import ViewCards from "$lib/components/view-cards.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
</script>

{#if view}<ViewCards rows={ready ? (rows[viewKey] ?? []) : null} {view} {type} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
