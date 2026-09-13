<script lang="ts">
	import { collectionLabel, listHref } from "$lib/app/labels.ts";
	import MetricWidget from "$lib/components/metric-widget.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values, rows, ready = true, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const viewRows = $derived(rows[viewKey] ?? []);
</script>

{#if view}<MetricWidget title={String(values.title || view.label)} rows={ready ? viewRows : null} value={String(values.value ?? "")} date={String(values.date ?? "created_at")} description={String(values.description ?? "").trim()} context={view.group_by || !type ? "" : `Across ${viewRows.length} ${(viewRows.length === 1 ? type.label : collectionLabel(type)).toLocaleLowerCase()}`} href={listHref(view)} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
