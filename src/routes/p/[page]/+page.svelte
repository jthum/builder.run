<script lang="ts">
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import type { PageBlock } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	const pageKey = $derived(page.params.page);
	const spec = $derived(session.snapshot?.spec);
	const current = $derived(spec?.pages.find((item) => item.key === pageKey));
	let viewRows = $state<Record<string, Array<Record<string, unknown>>> | null>(null);

	$effect(() => {
		void session.revision;
		void pageKey;
		viewRows = null;
		void (async () => {
			const next: Record<string, Array<Record<string, unknown>>> = {};
			for (const block of current?.blocks ?? []) {
				if (block.kind === "view") next[block.view] = await runtime().queryView(block.view);
			}
			viewRows = next;
		})();
	});

	async function runFlow(flowKey: string, label?: string) {
		await runtime().invoke(flowKey, {});
		toast.success(label || "Done");
	}
</script>

{#if current}
	<div class="flex flex-col gap-6">
		<PageHeader title={current.label} />
		{#each current.blocks as block, index (index)}
			{@render blockView(block)}
		{/each}
	</div>
{/if}

{#snippet blockView(block: PageBlock)}
	{#if block.kind === "text"}
		<p class="max-w-2xl text-muted-foreground">{block.text}</p>
	{:else if block.kind === "view"}
		{@const view = spec?.views.find((item) => item.key === block.view)}
		{#if view}
			<RecordTable rows={viewRows?.[view.key] ?? null} {view} typeKey={view.source} createHref="/t/{view.source}/new" />
		{/if}
	{:else if block.kind === "form"}
		{@const form = spec?.forms.find((item) => item.key === block.form)}
		{@const type = spec?.types.find((item) => item.key === form?.type)}
		{#if form && type}
			<RecordForm {type} {form} fields={form.fields} />
		{/if}
	{:else if block.kind === "action"}
		<Button onclick={() => runFlow(block.flow, block.label)}>{block.label ?? "Run"}</Button>
	{:else if block.kind === "group"}
		<div class="flex flex-col gap-4">
			{#each block.blocks as child, index (index)}
				{@render blockView(child)}
			{/each}
		</div>
	{/if}
{/snippet}
