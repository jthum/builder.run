<script lang="ts">
	import { page } from "$app/state";
	import { addLabel, typeByKey } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const viewKey = $derived(page.params.view);
	const spec = $derived(session.snapshot?.spec);
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(typeByKey(spec, view?.source));
	let rows = $state<Array<Record<string, unknown>> | null>(null);
	let expose = $state<Record<string, string>>({});

	const exposeFields = $derived(
		(view?.expose ?? [])
			.map((key) => type?.fields.find((field) => field.key === key))
			.filter((field): field is NonNullable<typeof field> => Boolean(field)),
	);

	$effect(() => {
		void view?.key;
		expose = Object.fromEntries((view?.expose ?? []).map((key) => [key, ""]));
	});

	$effect(() => {
		void session.revision;
		void viewKey;
		void expose;
		rows = null;
		if (!view) return;
		const extra = Object.fromEntries(Object.entries(expose).filter(([, value]) => value !== ""));
		void runtime()
			.queryView(view.key, extra)
			.then((result) => {
				rows = result;
			});
	});
</script>

{#if view}
	<div class="flex flex-col gap-6">
		<PageHeader title={view.label}>
			{#snippet actions()}
				<Button href="/t/{view.source}/new">
					<PlusIcon data-icon="inline-start" />
					{type ? addLabel(type) : "Add"}
				</Button>
			{/snippet}
		</PageHeader>
		{#if exposeFields.length}
			<div class="flex flex-wrap items-end gap-3">
				{#each exposeFields as field (field.key)}
					<div class="flex min-w-40 flex-col gap-1.5">
						<label class="text-sm font-medium" for="expose-{field.key}">{field.label}</label>
						{#if field.type === "enum"}
							<AppSelect
								bind:value={expose[field.key]}
								options={[
									{ value: "", label: "Any" },
									...(field.values ?? []).map((value) => ({
										value,
										label: labelFromKey(value),
									})),
								]}
							/>
						{:else}
							<Input
								id="expose-{field.key}"
								bind:value={expose[field.key]}
								placeholder="Any"
							/>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
		<RecordTable
			{rows}
			{view}
			typeKey={view.source}
			createHref="/t/{view.source}/new"
			emptyTitle={`No ${view.label.toLowerCase()} yet`}
			emptyDescription="Nothing matches this list right now."
		/>
	</div>
{/if}
