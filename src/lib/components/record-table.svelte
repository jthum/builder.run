<script lang="ts">
	import { goto } from "$app/navigation";
	import {
		addLabel,
		collectionLabel,
		columnLabel,
		emptyCollectionDescription,
		emptyCollectionTitle,
		formatCell,
		formatMoney,
		isAmountPath,
		isStatusPath,
		typeByKey,
	} from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import type { DataTableColumn } from "$lib/components/data-table.ts";
	import DataTable from "$lib/components/data-table.svelte";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import ViewExposeBar from "$lib/components/view-expose-bar.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import type { FieldDef, TypeDef, ViewDef } from "$lib/runtime/model.ts";
	import { toast } from "svelte-sonner";

	let {
		rows,
		view,
		typeKey,
		createHref,
		createLabel,
		emptyTitle,
		emptyDescription,
		compact = false,
		title,
		actionHref,
		actionLabel,
		onCreate,
		exposedFields = [],
		exposedValues = $bindable({}),
	}: {
		rows: Array<Record<string, unknown>> | null;
		view: ViewDef;
		typeKey: string;
		createHref?: string;
		createLabel?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		compact?: boolean;
		title?: string;
		actionHref?: string;
		actionLabel?: string;
		onCreate?: () => void;
		exposedFields?: FieldDef[];
		exposedValues?: Record<string, string>;
	} = $props();

	const type = $derived(typeByKey(session.snapshot?.spec, typeKey) as TypeDef | undefined);
	const add = $derived(createLabel ?? (type ? addLabel(type) : "Add"));
	const columns = $derived.by((): DataTableColumn[] => {
		const keys = view.fields.length ? view.fields : ["id"];
		return keys.map((key) => {
			const fieldKey = key.split(".")[0] ?? key;
			const field = type?.fields.find((item) => item.key === fieldKey);
			return {
				id: key,
				label: columnLabel(key, type),
				sortable: true,
				numeric: isAmountPath(key) || field?.type === "number",
				filterValues: field?.type === "enum" ? field.values : undefined,
				href: (row) => (key === keys[0] ? `/t/${typeKey}/${row.id}` : undefined),
			};
		});
	});
	const amountColumns = $derived(columns.filter((column) => isAmountPath(column.id)));
	const externalFilterIds = $derived(exposedFields.map((field) => field.key));
	const externallyFiltered = $derived(
		exposedFields.some((field) => Boolean(exposedValues[field.key])),
	);

	let pending = $state<Array<Record<string, unknown>>>([]);

	function openRow(row: Record<string, unknown>) {
		const id = String(row.id ?? "");
		if (id) void goto(`/t/${typeKey}/${id}`);
	}

	async function remove() {
		const targets = pending;
		pending = [];
		for (const row of targets) {
			const id = String(row.id ?? "");
			if (id) await runtime().remove(typeKey, id);
		}
		toast.success(targets.length > 1 ? `Deleted ${targets.length}` : "Deleted");
	}

	const pendingTitle = $derived.by(() => {
		if (pending.length === 1) {
			const row = pending[0];
			const key = columns[0]?.id ?? "id";
			return formatCell(key, row?.[key]);
		}
		if (pending.length > 1) return `${pending.length} records`;
		return "this";
	});
</script>

<DataTable
	{rows}
	{columns}
	{compact}
	createHref={createHref}
	createLabel={add}
	{onCreate}
	emptyTitle={emptyTitle ?? (type ? emptyCollectionTitle(type) : "Nothing here yet")}
	emptyDescription={emptyDescription ??
		(type ? emptyCollectionDescription(type) : "Add a record to get started.")}
	title={title ?? (compact || !type ? undefined : `All ${collectionLabel(type).toLowerCase()}`)}
	{actionHref}
	{actionLabel}
	searchPlaceholder={`Search ${type ? collectionLabel(type).toLowerCase() : "records"}`}
	{externalFilterIds}
	{externallyFiltered}
	onOpen={openRow}
	onDelete={(items) => (pending = items)}
>
	{#snippet filterControls()}
		<ViewExposeBar fields={exposedFields} bind:values={exposedValues} />
	{/snippet}
	{#snippet cell({ row, column, value, index })}
		<FormattedValue
			path={column.id}
			{value}
			{type}
			badge={isStatusPath(column.id)}
			href={index === 0 ? `/t/${typeKey}/${row.id}` : column.href?.(row)}
		/>
	{/snippet}
	{#snippet footer({ rows: visibleRows, columns: visibleCols })}
		{#if amountColumns.length && visibleRows.length > 1}
			<Table.Row>
				<Table.Cell></Table.Cell>
				{#each visibleCols as column, index (column.id)}
					<Table.Cell class={column.numeric ? "text-end tabular-nums" : undefined}>
						{#if index === 0}
							<span class="text-muted-foreground">Total</span>
						{:else if isAmountPath(column.id)}
							{formatMoney(
								visibleRows.reduce((sum, row) => {
									const numeric = Number(row[column.id]);
									return sum + (Number.isNaN(numeric) ? 0 : numeric);
								}, 0),
							)}
						{/if}
					</Table.Cell>
				{/each}
				<Table.Cell></Table.Cell>
			</Table.Row>
		{/if}
	{/snippet}
</DataTable>

<AlertDialog.Root open={pending.length > 0} onOpenChange={(open) => !open && (pending = [])}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {pendingTitle}?</AlertDialog.Title>
			<AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
