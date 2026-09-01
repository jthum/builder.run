<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { recordTitle } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordForm from "$lib/components/record-form.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { implicitEditFormKey } from "$lib/runtime/defaults.ts";
	import type { RecordValue } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	const typeKey = $derived(page.params.type ?? "");
	const id = $derived(page.params.id ?? "");
	const spec = $derived(session.snapshot?.spec);
	const type = $derived(spec?.types.find((item) => item.key === typeKey));
	const form = $derived(spec?.forms.find((item) => item.key === implicitEditFormKey(typeKey)));
	const flows = $derived(
		(spec?.flows ?? []).filter(
			(flow) => flow.expose?.includes("ui") && flow.input && Object.values(flow.input).some((expr) => expr.includes(typeKey)),
		),
	);
	let record = $state<RecordValue | null>(null);
	let missing = $state(false);
	let deleteOpen = $state(false);

	$effect(() => {
		void session.revision;
		void id;
		missing = false;
		void runtime()
			.getRecord(typeKey, id)
			.then((row) => {
				record = row;
				missing = !row;
			});
	});

	async function invoke(flowKey: string, label: string) {
		await runtime().invoke(flowKey, { [typeKey]: id });
		toast.success(label);
	}

	async function remove() {
		await runtime().remove(typeKey, id);
		toast.success("Deleted");
		await goto(`/t/${typeKey}`);
	}

	const title = $derived(recordTitle(record, type));
</script>

{#if type && record}
	<div class="flex flex-col gap-6">
		<PageHeader {title}>
			{#snippet actions()}
				{#each flows as flow (flow.id)}
					<Button variant="outline" onclick={() => invoke(flow.key, flow.label)}>{flow.label}</Button>
				{/each}
				<Button variant="destructive" onclick={() => (deleteOpen = true)}>Delete</Button>
			{/snippet}
		</PageHeader>
		<RecordForm {type} {record} {form} fields={form?.fields} />
	</div>
	<AlertDialog.Root bind:open={deleteOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Delete {title}?</AlertDialog.Title>
				<AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{:else if missing}
	<p class="text-muted-foreground">This record is gone, or the link is wrong.</p>
{/if}
