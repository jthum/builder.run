<script lang="ts">
	import { page } from "$app/state";
	import { addLabel } from "$lib/app/labels.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import PageHeader from "@jthum/framework/svelte/studio/page-header";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const viewKey = $derived(page.params.view);
	const view = $derived(canonicalStudio.context?.views.find((item) => item.key === viewKey));
	const type = $derived(canonicalStudio.context?.collections.find((item) => item.key === view?.source));
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
		void canonicalStudio.revision;
		void viewKey;
		void expose;
		rows = null;
		if (!view) return;
		const extra = Object.fromEntries(Object.entries(expose).filter(([, value]) => value !== ""));
		void canonicalStudio
			.queryViewWith(view.key, extra)
			.then((result) => {
				rows = result;
			});
	});
</script>

{#if view}
	<div class="flex flex-col gap-6">
		<PageHeader title={view.label}>
			{#snippet actions()}
				{#if !view.group_by}
					<Button href="/t/{view.source}/new">
						<PlusIcon data-icon="inline-start" />
						{type ? addLabel(type) : "Add"}
					</Button>
				{/if}
			{/snippet}
		</PageHeader>
		<RecordTable
			{rows}
			{view}
			typeKey={view.source}
			exposedFields={exposeFields}
			bind:exposedValues={expose}
			createHref="/t/{view.source}/new"
			emptyTitle={`No ${view.label.toLowerCase()} yet`}
			emptyDescription="Nothing matches this list right now."
		/>
	</div>
{/if}
