<script lang="ts">
	import KanbanBoard from "$lib/components/kanban-board.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
</script>

{#if view}<KanbanBoard {view} {type} title={String(config.title ?? "")} field={String(config.field ?? "")} rows={ready ? (rows[viewKey] ?? []) : null} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
