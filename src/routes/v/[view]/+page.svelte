<script lang="ts">
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const viewKey = $derived(page.params.view);
	const view = $derived(session.snapshot?.spec.views.find((item) => item.key === viewKey));
	let rows = $state<Array<Record<string, unknown>>>([]);

	$effect(() => {
		void session.revision;
		void viewKey;
		if (!view) return;
		void runtime()
			.queryView(view.key)
			.then((result) => {
				rows = result;
			});
	});
</script>

{#if view}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-semibold">{view.label}</h1>
				<p class="text-muted-foreground">View of {view.source}</p>
			</div>
			<Button href="/t/{view.source}/new">
				<PlusIcon data-icon="inline-start" />
				New
			</Button>
		</div>
		<RecordTable {rows} {view} typeKey={view.source} createHref="/t/{view.source}/new" />
	</div>
{/if}
