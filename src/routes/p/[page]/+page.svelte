<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import PageCanvas from "$lib/components/page-canvas.svelte";
	import { resolvePage } from "$lib/runtime/widgets.ts";

	const pageKey = $derived(page.params.page ?? "");
	const spec = $derived(session.resolvedSpec);
	const current = $derived(spec ? resolvePage(spec, pageKey) : undefined);
	const startEditing = $derived(page.url.searchParams.get("edit") === "1");
</script>

{#if current}
	<PageCanvas page={current} title={current.label} {startEditing} />
{:else}
	<p class="text-muted-foreground">This page isn't in the app.</p>
{/if}
