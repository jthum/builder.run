<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import FormEditor from "$lib/components/form-editor.svelte";

	const canonicalForm = $derived(
		canonicalStudio.context?.forms.find((item) => item.key === page.params.form),
	);
	const form = $derived(
		canonicalStudio.context
			? canonicalForm
			: session.resolvedSpec?.forms.find((item) => item.key === page.params.form),
	);
</script>

{#if form}
	<FormEditor {form} canonical={Boolean(canonicalForm)} />
{:else}
	<p class="text-muted-foreground">This form isn't in the app.</p>
{/if}
