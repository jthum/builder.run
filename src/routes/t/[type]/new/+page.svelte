<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { addLabel } from "$lib/app/labels.ts";
	import { session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";
	import { implicitCreateFormKey } from "$lib/runtime/defaults.ts";

	const typeKey = $derived(page.params.type ?? "");
	const spec = $derived(session.snapshot?.spec);
	const type = $derived(spec?.types.find((item) => item.key === typeKey));
	const form = $derived(spec?.forms.find((item) => item.key === implicitCreateFormKey(typeKey)));
</script>

{#if type}
	<div class="flex flex-col gap-6">
		<PageHeader title={addLabel(type)} />
		<RecordForm {type} {form} fields={form?.fields} onSaved={(record) => record && goto(`/t/${type.key}/${record.id}`)} />
	</div>
{/if}
