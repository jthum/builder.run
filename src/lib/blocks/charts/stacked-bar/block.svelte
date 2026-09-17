<script lang="ts">
	import ChartMark from "$lib/components/chart-mark.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
</script>

{#if view}<ChartMark mark="stacked" title={String(config.title || view.label)} rows={ready ? (rows[viewKey] ?? []) : null} category={String(config.category ?? "")} value={String(config.value ?? "")} series={String(config.series ?? "")} time={false} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
