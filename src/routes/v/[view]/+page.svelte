<script lang="ts">
	import { page } from "$app/state";
	import { addLabel, typeByKey } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const viewKey = $derived(page.params.view);
	const spec = $derived(session.snapshot?.spec);
	const view = $derived(spec?.views.find((item) => item.key === viewKey));
	const type = $derived(typeByKey(spec, view?.source));
	let rows = $state<Array<Record<string, unknown>> | null>(null);

	$effect(() => {
		void session.revision;
		void viewKey;
		rows = null;
		if (!view) return;
		void runtime()
			.queryView(view.key)
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
