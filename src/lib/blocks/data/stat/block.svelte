<script lang="ts">
	import { listHref } from "$lib/app/labels.ts";
	import StatCard from "$lib/components/stat-card.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
</script>

{#if view}<StatCard label={String(config.title || view.label)} count={(rows[viewKey] ?? []).length} description={String(config.description ?? "").trim()} href={listHref(view)} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
