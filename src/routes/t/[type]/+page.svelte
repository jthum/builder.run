<script lang="ts">
	import { page } from "$app/state";
	import { addLabel, collectionLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { implicitViewKey } from "$lib/runtime/defaults.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const typeKey = $derived(page.params.type ?? "");
	const spec = $derived(session.resolvedSpec);
	const type = $derived(spec?.types.find((item) => item.key === typeKey));
	const view = $derived(
		spec?.views.find((item) => item.key === implicitViewKey(typeKey)) ??
			spec?.views.find((item) => item.source === typeKey),
	);
	let rows = $state<Array<Record<string, unknown>> | null>(null);

	$effect(() => {
		void session.revision;
		void typeKey;
		rows = null;
		if (!view) return;
		void runtime()
			.queryView(view.key)
			.then((result) => {
				rows = result;
			});
	});
</script>

{#if type && view}
	<div class="flex flex-col gap-6">
		<PageHeader title={collectionLabel(type)}>
			{#snippet actions()}
				<Button href="/t/{type.key}/new">
					<PlusIcon data-icon="inline-start" />
					{addLabel(type)}
				</Button>
			{/snippet}
		</PageHeader>
		<RecordTable {rows} {view} typeKey={type.key} createHref="/t/{type.key}/new" />
	</div>
{:else}
	<p class="text-muted-foreground">This list isn't in the app.</p>
{/if}
