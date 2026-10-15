<script lang="ts">
	import { collectionLabel, listHref } from "$lib/app/labels.ts";
	import MetricBlock from "$lib/components/metric-block.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
	const viewRows = $derived(rows[viewKey] ?? []);
</script>

{#if view}<MetricBlock title={String(config.title || view.label)} rows={ready ? viewRows : null} value={String(config.value ?? "")} date={String(config.date ?? "created_at")} description={String(config.description ?? "").trim()} context={view.group_by || !type ? "" : `Across ${viewRows.length} ${(viewRows.length === 1 ? type.label : collectionLabel(type)).toLocaleLowerCase()}`} href={listHref(view)} {view} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
