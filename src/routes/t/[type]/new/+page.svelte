<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { addLabel, recordTitle } from "$lib/app/labels.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageHeader from "@jthum/framework/svelte/studio/page-header";
	import RecordForm from "$lib/components/record-form.svelte";
	import { implicitCreateFormKey } from "$lib/runtime/defaults.ts";

	const typeKey = $derived(page.params.type ?? "");
	const type = $derived(canonicalStudio.context?.collections.find((item) => item.key === typeKey));
	const form = $derived(canonicalStudio.context?.forms.find((item) => item.key === implicitCreateFormKey(typeKey)));
	const defaults = $derived(Object.fromEntries(page.url.searchParams.entries()));
	const omit = $derived(
		type
			? type.fields
					.filter((field) => field.type === "reference" && Boolean(defaults[field.key]))
					.map((field) => field.key)
			: [],
	);

	let contextLabel = $state("");

	$effect(() => {
		const current = type;
		const initial = defaults;
		const keys = omit;
		void (async () => {
			if (!current || !keys.length) {
				contextLabel = "";
				return;
			}
			const names: string[] = [];
			for (const key of keys) {
				const field = current.fields.find((item) => item.key === key);
				const target = field?.target ?? "";
				const id = String(initial[key] ?? "");
				if (!target || !id) continue;
				try {
					const row = await canonicalStudio.getRecord(target, id);
					if (row) names.push(recordTitle(row));
				} catch (err) {
					console.warn("Couldn't load linked record", err);
				}
			}
			contextLabel = names.join(", ");
		})();
	});
</script>

{#if type}
	<div class="flex flex-col gap-6">
		<PageHeader
			title={addLabel(type)}
			description={contextLabel ? `This will be added to ${contextLabel}.` : undefined}
		/>
		<RecordForm
			{type}
			{form}
			{defaults}
			{omit}
			fields={form?.fields}
			onSaved={(record) => record && goto(`/t/${type.key}/${record.id}`)}
		/>
	</div>
{/if}
