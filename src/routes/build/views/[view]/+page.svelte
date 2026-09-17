<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import ViewEditor from "$lib/components/view-editor.svelte";

	const view = $derived(session.resolvedSpec?.views.find((item) => item.key === page.params.view));
</script>

{#if view}
	<ViewEditor {view} />
{:else}
	<p class="text-muted-foreground">This view isn't in the app.</p>
{/if}
