<script lang="ts">
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { implicitViewKey } from "$lib/runtime/defaults.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";

	const typeKey = $derived(page.params.type ?? "");
	const spec = $derived(session.snapshot?.spec);
	const type = $derived(spec?.types.find((item) => item.key === typeKey));
	const view = $derived(
		spec?.views.find((item) => item.key === implicitViewKey(typeKey)) ??
			spec?.views.find((item) => item.source === typeKey),
	);
	let rows = $state<Array<Record<string, unknown>>>([]);

	$effect(() => {
		void session.revision;
		void typeKey;
		if (!view) {
			rows = [];
			return;
		}
		void runtime()
			.queryView(view.key)
			.then((result) => {
				rows = result;
			});
	});
</script>

{#if type && view}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-2">
			<div>
				<h1 class="text-2xl font-semibold">{type.label}</h1>
				<p class="text-muted-foreground">{view.label}</p>
			</div>
			<Button href="/t/{type.key}/new">
				<PlusIcon data-icon="inline-start" />
				New
			</Button>
		</div>
		<RecordTable {rows} {view} typeKey={type.key} createHref="/t/{type.key}/new" />
	</div>
{:else}
	<p class="text-muted-foreground">Unknown type.</p>
{/if}
