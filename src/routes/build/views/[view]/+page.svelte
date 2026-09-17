<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import ViewEditor from "$lib/components/view-editor.svelte";

	const canonicalView = $derived(
		canonicalStudio.context?.views.find((item) => item.key === page.params.view),
	);
	const view = $derived(
		canonicalStudio.context
			? canonicalView
			: session.resolvedSpec?.views.find((item) => item.key === page.params.view),
	);
</script>

{#if view}
	<ViewEditor {view} canonical={Boolean(canonicalView)} />
{:else}
	<p class="text-muted-foreground">This view isn't in the app.</p>
{/if}
