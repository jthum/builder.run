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
	import { compactWhere, FILTER_OPS, normalizeFilters, type FilterOp } from "$lib/runtime/filters.ts";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import type { SortDirection, ViewDef } from "$lib/runtime/model.ts";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";

	let { view }: { view: ViewDef } = $props();

	const types = $derived(session.snapshot?.spec.types ?? []);

	let label = $state("");
	let source = $state("");
	let selected = $state<string[]>([]);
	let filters = $state<Array<{ field: string; op: string; value: string }>>([]);
	let expose = $state<string[]>([]);
	let limit = $state("");
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
	$effect(() => {
		label = view.label;
		source = view.source;
		selected = [...view.fields];
		filters = normalizeFilters(view.where).map((clause) => ({
			field: clause.field,
			op: clause.op ?? "eq",
			value: Array.isArray(clause.value) ? clause.value.join(", ") : String(clause.value ?? ""),
		}));
		expose = [...(view.expose ?? [])];
		limit = view.limit ? String(view.limit) : "";
		const order = view.order_by ? Object.entries(view.order_by)[0] : undefined;
		orderField = order?.[0] ?? "";
		orderDir = (order?.[1] as SortDirection) ?? "asc";
		featured = !view.implicit;
	});

	function fieldDef(key: string) {
		return sourceType?.fields.find((item) => item.key === key);
	}

	function needsValue(op: string) {
		return op !== "empty" && op !== "not_empty";
	}

	function addFilter() {
		filters = [...filters, { field: sourceType?.fields[0]?.key ?? "", op: "eq", value: "" }];
	}

	function removeFilter(index: number) {
		filters = filters.filter((_, item) => item !== index);
	}

	function toggleExpose(field: string, on: boolean) {
		expose = on
			? expose.includes(field)
				? expose
				: [...expose, field]
			: expose.filter((item) => item !== field);
	}

	function builtWhere() {
		return compactWhere(
			filters
				.filter((clause) => clause.field && (!needsValue(clause.op) || clause.value !== ""))
				.map((clause) => ({
					field: clause.field,
					op: clause.op as FilterOp,
					value:
						clause.op === "in"
							? clause.value
									.split(",")
									.map((item) => item.trim())
									.filter(Boolean)
							: clause.value,
				})),
		);
	}

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
			where: builtWhere(),
			expose: expose.length ? expose : undefined,
			limit: Number(limit) || undefined,
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
		where: builtWhere(),
		expose,
		limit: Number(limit) || undefined,
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
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2">
						<Field.Label>Filters</Field.Label>
						<Button variant="ghost" size="xs" onclick={addFilter}>
							<PlusIcon data-icon="inline-start" />
							Add
						</Button>
					</div>
					{#if !filters.length}
						<p class="text-sm text-muted-foreground">All records of this type.</p>
					{/if}
					{#each filters as clause, index (index)}
						{@const def = fieldDef(clause.field)}
						<div class="flex flex-col gap-2 rounded-xl border p-3">
							<div class="flex items-start gap-2">
								<div class="grid min-w-0 flex-1 gap-2">
									<AppSelect
										bind:value={clause.field}
										options={(sourceType?.fields ?? []).map((field) => ({
											value: field.key,
											label: field.label,
										}))}
									/>
									<AppSelect
										bind:value={clause.op}
										options={FILTER_OPS.map((item) => ({ value: item.value, label: item.label }))}
									/>
									{#if needsValue(clause.op)}
										{#if def?.type === "enum" && clause.op !== "contains"}
											<AppSelect
												bind:value={clause.value}
												options={(def.values ?? []).map((value) => ({
													value,
													label: labelFromKey(value),
												}))}
											/>
										{:else}
											<Input
												bind:value={clause.value}
												placeholder={clause.op === "in" ? "sent, overdue" : "value"}
											/>
										{/if}
									{/if}
								</div>
								<Button variant="ghost" size="icon-xs" onclick={() => removeFilter(index)} aria-label="Remove filter">
									<XIcon />
								</Button>
							</div>
						</div>
					{/each}
				</div>
				{#if sourceType?.fields.length}
					<Field.Field>
						<Field.Label>People can filter by</Field.Label>
						<div class="flex flex-col gap-2 rounded-xl border p-3">
							{#each sourceType.fields as field (field.key)}
								<Field.Field orientation="horizontal">
									<Checkbox
										checked={expose.includes(field.key)}
										onCheckedChange={(value) => toggleExpose(field.key, Boolean(value))}
									/>
									<Field.Label class="font-normal">{field.label}</Field.Label>
								</Field.Field>
							{/each}
						</div>
					</Field.Field>
				{/if}
				<Field.Field>
					<Field.Label>Limit</Field.Label>
					<Input bind:value={limit} inputmode="numeric" placeholder="No limit" />
				</Field.Field>
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
