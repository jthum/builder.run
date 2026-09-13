<script lang="ts">
	import { listHref } from "$lib/app/labels.ts";
	import StatCard from "$lib/components/stat-card.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values, rows, ready = true, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
</script>

{#if view}<StatCard label={String(values.title || view.label)} count={(rows[viewKey] ?? []).length} description={String(values.description ?? "").trim()} href={listHref(view)} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
