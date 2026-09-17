<script lang="ts">
	import { page } from "$app/state";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import FormEditor from "$lib/components/form-editor.svelte";

	const form = $derived(
		canonicalStudio.context?.forms.find((item) => item.key === page.params.form),
	);
</script>

{#if form}
	<FormEditor {form} />
{:else}
	<p class="text-muted-foreground">This form isn't in the app.</p>
{/if}
