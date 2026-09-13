<script lang="ts">
	import ViewList from "$lib/components/view-list.svelte";
	import type { WidgetRendererProps } from "$lib/widgets/types.ts";
	let { values, rows, ready = true, spec }: WidgetRendererProps = $props();
	const viewKey = $derived(String(values.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
</script>

{#if view}<ViewList rows={ready ? (rows[viewKey] ?? []) : null} {view} {type} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this widget.</p>{/if}
