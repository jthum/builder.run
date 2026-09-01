<script lang="ts">
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import RecordForm from "$lib/components/record-form.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	const pageKey = $derived(page.params.page);
	const spec = $derived(session.snapshot?.spec);
	const current = $derived(spec?.pages.find((item) => item.key === pageKey));
	let viewRows = $state<Record<string, Array<Record<string, unknown>>>>({});

	$effect(() => {
		void session.revision;
		void pageKey;
		void (async () => {
			const next: Record<string, Array<Record<string, unknown>>> = {};
			for (const block of current?.blocks ?? []) {
				if (block.kind === "view") next[block.view] = await runtime().queryView(block.view);
			}
			viewRows = next;
		})();
	});

	async function runFlow(flowKey: string) {
		await runtime().invoke(flowKey, {});
		toast.success("Flow ran");
	}
</script>

{#if current}
	<div class="flex flex-col gap-6">
		<h1 class="text-2xl font-semibold">{current.label}</h1>
		{#each current.blocks as block, index (index)}
			{@render blockView(block)}
		{/each}
	</div>
{/if}

{#snippet blockView(block: PageBlock)}
	{#if block.kind === "text"}
		<p class="text-muted-foreground">{block.text}</p>
	{:else if block.kind === "view"}
		{@const view = spec?.views.find((item) => item.key === block.view)}
		{#if view}
			<RecordTable rows={viewRows[view.key] ?? []} {view} typeKey={view.source} createHref="/t/{view.source}/new" />
		{/if}
	{:else if block.kind === "form"}
		{@const form = spec?.forms.find((item) => item.key === block.form)}
		{@const type = spec?.types.find((item) => item.key === form?.type)}
		{#if form && type}
			<RecordForm {type} fields={form.fields} />
		{/if}
	{:else if block.kind === "action"}
		<Button onclick={() => runFlow(block.flow)}>{block.label ?? block.flow}</Button>
	{:else if block.kind === "group"}
		<div class="flex flex-col gap-4">
			{#each block.blocks as child, index (index)}
				{@render blockView(child)}
			{/each}
		</div>
	{/if}
{/snippet}
