<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import TypeEditor from "$lib/components/type-editor.svelte";

	const type = $derived(
		canonicalStudio.context?.collections.find((item) => item.key === page.params.type) ??
			session.resolvedSpec?.types.find((item) => item.key === page.params.type),
	);
	const canonical = $derived(
		Boolean(canonicalStudio.context?.collections.some((item) => item.key === page.params.type)),
	);
</script>

{#if type}
	<TypeEditor {type} {canonical} />
{:else}
	<p class="text-muted-foreground">This kind of record isn't in the app.</p>
{/if}
