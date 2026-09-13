<script lang="ts">
	import ChartMark from "$lib/components/chart-mark.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values, rows, ready = true, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
</script>

{#if view}<ChartMark mark="line" title={String(values.title || view.label)} rows={ready ? (rows[viewKey] ?? []) : null} category={String(values.category ?? "")} value={String(values.value ?? "")} series="" time {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
