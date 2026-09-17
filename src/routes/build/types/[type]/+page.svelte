<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import TypeEditor from "$lib/components/type-editor.svelte";

	const type = $derived(session.resolvedSpec?.types.find((item) => item.key === page.params.type));
</script>

{#if type}
	<TypeEditor {type} />
{:else}
	<p class="text-muted-foreground">This kind of record isn't in the app.</p>
{/if}
