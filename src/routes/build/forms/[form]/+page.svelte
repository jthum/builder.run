<script lang="ts">
	import { page } from "$app/state";
	import { session } from "$lib/app/session.svelte.ts";
	import RecordForm from "$lib/components/record-form.svelte";

	const form = $derived(session.snapshot?.spec.forms.find((item) => item.key === page.params.form));
	const type = $derived(session.snapshot?.spec.types.find((item) => item.key === form?.type));
</script>

{#if form && type}
	<div class="flex flex-col gap-4">
		<h1 class="text-2xl font-semibold">{form.label}</h1>
		<p class="text-muted-foreground">{form.mode} form for {type.label}</p>
		<RecordForm {type} {form} fields={form.fields} />
	</div>
{:else}
	<p class="text-muted-foreground">Unknown form.</p>
{/if}
