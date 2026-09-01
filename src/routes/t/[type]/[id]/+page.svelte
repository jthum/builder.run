<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import RecordForm from "$lib/components/record-form.svelte";
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
		(spec?.flows ?? []).filter((flow) => flow.expose?.includes("ui") && flow.input && Object.values(flow.input).some((expr) => expr.includes(typeKey))),
	);
	let record = $state<RecordValue | null>(null);

	$effect(() => {
		void session.revision;
		void id;
		void runtime()
			.getRecord(typeKey, id)
			.then((row) => {
				record = row;
			});
	});

	async function invoke(flowKey: string) {
		await runtime().invoke(flowKey, { [typeKey]: id });
		toast.success("Flow ran");
	}

	async function remove() {
		if (!confirm("Delete this record?")) return;
		await runtime().remove(typeKey, id);
		await goto(`/t/${typeKey}`);
	}
</script>

{#if type && record}
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-2">
			<h1 class="text-2xl font-semibold">{String(record.name ?? record.title ?? record.number ?? type.label)}</h1>
			<div class="flex gap-2">
				{#each flows as flow (flow.id)}
					<Button variant="outline" onclick={() => invoke(flow.key)}>{flow.label}</Button>
				{/each}
				<Button variant="destructive" onclick={remove}>Delete</Button>
			</div>
		</div>
		<RecordForm {type} {record} fields={form?.fields} />
	</div>
{:else}
	<p class="text-muted-foreground">Record not found.</p>
{/if}
