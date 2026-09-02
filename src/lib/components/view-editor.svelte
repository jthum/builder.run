<script lang="ts">
	import { columnLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { SortDirection, ViewDef } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";

	let { view }: { view: ViewDef } = $props();

	const types = $derived(session.snapshot?.spec.types ?? []);

	let label = $state("");
	let source = $state("");
	let selected = $state<string[]>([]);
	let whereField = $state("");
	let whereValue = $state("");
	let orderField = $state("");
	let orderDir = $state("asc");
	let featured = $state(true);
	let deleteOpen = $state(false);

	const sourceType = $derived(
		types.find((item) => item.key === source) ?? types.find((item) => item.key === view.source),
	);
	const fieldChoices = $derived(
		(sourceType?.fields ?? []).map((field) =>
			field.type === "reference" ? `${field.key}.name` : field.key,
		),
	);
	const whereFieldDef = $derived(sourceType?.fields.find((field) => field.key === whereField));

	$effect(() => {
		label = view.label;
		source = view.source;
		selected = [...view.fields];
		const where = view.where ? Object.entries(view.where)[0] : undefined;
		whereField = where?.[0] ?? "";
		whereValue = where ? String(where[1] ?? "") : "";
		const order = view.order_by ? Object.entries(view.order_by)[0] : undefined;
		orderField = order?.[0] ?? "";
		orderDir = (order?.[1] as SortDirection) ?? "asc";
		featured = !view.implicit;
	});

	function toggle(field: string, on: boolean) {
		selected = on
			? selected.includes(field)
				? selected
				: [...selected, field]
			: selected.filter((item) => item !== field);
	}

	async function save() {
		await runtime().upsertView({
			key: view.key,
			id: view.id,
			label,
			source,
			fields: selected,
			where: whereField && whereValue !== "" ? { [whereField]: whereValue } : undefined,
			order_by: orderField ? { [orderField]: orderDir as SortDirection } : undefined,
			implicit: featured ? false : view.implicit,
		});
		toast.success("View saved");
	}

	async function remove() {
		await runtime().deleteView(view.key);
		toast.success("View deleted");
		await goto("/build/views");
	}

	let preview = $state<Array<Record<string, unknown>> | null>(null);
	const previewView = $derived({
		...view,
		label,
		source,
		fields: selected,
		where: whereField && whereValue !== "" ? { [whereField]: whereValue } : undefined,
		order_by: orderField ? { [orderField]: orderDir } : undefined,
	} as ViewDef);

	$effect(() => {
		void session.revision;
		void view.key;
		preview = null;
		void runtime()
			.queryView(view.key)
			.then((rows) => {
				preview = rows;
			});
	});
</script>

<div class="flex flex-col gap-8">
	<PageHeader title={label || view.label} description="A saved list. People can open it from the menu if you feature it.">
		{#snippet actions()}
			<Button onclick={save}>Save</Button>
			{#if !view.implicit}
				<Button variant="ghost" onclick={() => (deleteOpen = true)}>Delete</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
		<div class="flex flex-col gap-6">
			<Field.Group>
				<Field.Field>
					<Field.Label>Name</Field.Label>
					<Input bind:value={label} placeholder="Active projects" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Show records of</Field.Label>
					<AppSelect
						bind:value={source}
						options={types.map((item) => ({ value: item.key, label: item.label }))}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label>Columns</Field.Label>
					<div class="flex flex-col gap-2 rounded-xl border p-3">
						{#each fieldChoices as field (field)}
							<Field.Field orientation="horizontal">
								<Checkbox
									checked={selected.includes(field)}
									onCheckedChange={(value) => toggle(field, Boolean(value))}
								/>
								<Field.Label class="font-normal">{columnLabel(field, sourceType)}</Field.Label>
							</Field.Field>
						{/each}
					</div>
				</Field.Field>
				<Field.Field>
					<Field.Label>Only show where</Field.Label>
					<AppSelect
						bind:value={whereField}
						options={[
							{ value: "", label: "Everything" },
							...(sourceType?.fields ?? []).map((field) => ({ value: field.key, label: field.label })),
						]}
					/>
				</Field.Field>
				{#if whereField}
					<Field.Field>
						<Field.Label>Equals</Field.Label>
						{#if whereFieldDef?.type === "enum"}
							<AppSelect
								bind:value={whereValue}
								options={(whereFieldDef.values ?? []).map((value) => ({
									value,
									label: labelFromKey(value),
								}))}
							/>
						{:else}
							<Input bind:value={whereValue} placeholder="active" />
						{/if}
					</Field.Field>
				{/if}
				<Field.Field>
					<Field.Label>Sort by</Field.Label>
					<AppSelect
						bind:value={orderField}
						options={[
							{ value: "", label: "Default" },
							...(sourceType?.fields ?? []).map((field) => ({ value: field.key, label: field.label })),
							{ value: "updated_at", label: "Last updated" },
							{ value: "created_at", label: "Created" },
						]}
					/>
				</Field.Field>
				{#if orderField}
					<Field.Field>
						<Field.Label>Direction</Field.Label>
						<AppSelect
							bind:value={orderDir}
							options={[
								{ value: "asc", label: "Ascending" },
								{ value: "desc", label: "Descending" },
							]}
						/>
					</Field.Field>
				{/if}
				<Field.Field orientation="horizontal">
					<Switch bind:checked={featured} id="featured" />
					<Field.Label for="featured">Show in the app menu</Field.Label>
				</Field.Field>
			</Field.Group>
		</div>
		<div class="flex min-w-0 flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Preview</h2>
			<RecordTable rows={preview} view={previewView} typeKey={source} compact />
		</div>
	</div>
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {view.label}?</AlertDialog.Title>
			<AlertDialog.Description>The list disappears from the app. Records stay.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
