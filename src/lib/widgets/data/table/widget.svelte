<script lang="ts">
	import { listHref } from "$lib/app/labels.ts";
	import RecordTable from "$lib/components/record-table.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values, rows, ready = true, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const viewRows = $derived(rows[viewKey] ?? []);
</script>

{#if view}
	<RecordTable rows={ready ? viewRows : null} {view} typeKey={view.source} title={String(values.title || view.label)} compact={Boolean(values.compact)} actionHref={listHref(view)} actionLabel="View all" createHref={values.compact ? undefined : `/t/${view.source}/new`} />
{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
