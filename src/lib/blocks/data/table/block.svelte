<script lang="ts">
	import { listHref } from "$lib/app/labels.ts";
	import RecordTable from "$lib/components/record-table.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const viewRows = $derived(rows[viewKey] ?? []);
</script>

{#if view}
	<RecordTable rows={ready ? viewRows : null} {view} typeKey={view.source} title={String(config.title || view.label)} compact={Boolean(config.compact)} actionHref={listHref(view)} actionLabel="View all" createHref={config.compact ? undefined : `/t/${view.source}/new`} />
{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
