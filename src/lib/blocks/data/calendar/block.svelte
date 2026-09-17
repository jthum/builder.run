<script lang="ts">
	import CalendarMonth from "$lib/components/calendar-month.svelte";
	import type { BlockProps } from "$lib/blocks/types.ts";
	let { config, rows, ready = true, spec }: BlockProps = $props();
	const viewKey = $derived(String(config.view ?? ""));
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(spec?.types.find((item) => item.key === view?.source));
</script>

{#if view}<CalendarMonth {view} {type} title={String(config.title ?? "")} dateField={String(config.date ?? "")} rows={ready ? (rows[viewKey] ?? []) : null} {ready} />{:else}<p class="text-sm text-muted-foreground">Pick a view for this block.</p>{/if}
