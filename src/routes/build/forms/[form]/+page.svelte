<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";

	const form = $derived(session.snapshot?.spec.forms.find((item) => item.key === page.params.form));
	const type = $derived(session.snapshot?.spec.types.find((item) => item.key === form?.type));
</script>

{#if form && type}
	<div class="flex flex-col gap-4">
		<PageHeader
			title={form.label}
			description={form.mode === "create" ? `Add a ${type.label.toLowerCase()}.` : `Edit a ${type.label.toLowerCase()}.`}
		/>
		<RecordForm {type} {form} fields={form.fields} />
	</div>
{:else}
	<p class="text-muted-foreground">This form isn't in the app.</p>
{/if}
