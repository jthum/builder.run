<script lang="ts">
	import KanbanBoard from "$lib/components/kanban-board.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values, rows, ready = true, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
</script>

{#if view}<KanbanBoard {view} {type} title={String(values.title ?? "")} field={String(values.field ?? "")} rows={ready ? (rows[viewKey] ?? []) : null} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
