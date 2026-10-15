<script lang="ts">
	import { goto } from "$app/navigation";
	import {
		addLabel,
		aggregateRatingMax,
		collectionLabel,
		columnLabel,
		emptyCollectionDescription,
		emptyCollectionTitle,
		formatCell,
		formatMoney,
		isAmountPath,
		isStatusPath,
	} from "$lib/app/labels.ts";
	import { canonicalStudio } from "$lib/app/canonical-studio.svelte.ts";
	import { viewCellValue, viewDisplayFields } from "$lib/app/view-results.ts";
	import type { DataTableColumn } from "$lib/components/data-table.ts";
	import DataTable from "$lib/components/data-table.svelte";
	import FormattedValue from "$lib/components/formatted-value.svelte";
	import ViewExposeBar from "$lib/components/view-expose-bar.svelte";
	import * as AlertDialog from "@jthum/framework/svelte/ui/alert-dialog";
	import * as Table from "@jthum/framework/svelte/ui/table";
	import type { CollectionDraft, FieldDraft, ViewDraft } from "@jthum/framework/svelte/authoring/data";
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
		view: ViewDraft;
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
		exposedFields?: FieldDraft[];
		exposedValues?: Record<string, string>;
	} = $props();

	const type = $derived(canonicalStudio.context?.collections.find((item) => item.key === typeKey));
	const aggregated = $derived(Boolean(view.group_by));
	const add = $derived(createLabel ?? (type ? addLabel(type) : "Add"));
	const columns = $derived.by((): DataTableColumn[] => {
		const visible = viewDisplayFields(view, type);
		const keys = visible.length ? visible : ["id"];
		return keys.map((key) => {
			const fieldKey = key.split(".")[0] ?? key;
			const field = type?.fields.find((item) => item.key === fieldKey);
			const valueSemantics =
				field?.type === "enum" && field.presentation === "badge"
					? Object.fromEntries(
							(field.values ?? []).map((value) => [value, field.value_semantics?.[value] ?? "neutral"]),
						)
					: undefined;
			return {
				id: key,
				accessor: (row) => viewCellValue(view, row, key),
				label: columnLabel(key, type),
				sortable: true,
				numeric: isAmountPath(key) || field?.type === "number" || Boolean(view.measures?.[key]),
				clamp: field?.type === "text",
				filterValues: field?.type === "enum" ? field.values : undefined,
				valueSemantics,
				href: (row) => {
					if (!aggregated) return key === keys[0] ? `/t/${typeKey}/${row.id}` : undefined;
					if (key !== view.group_by || field?.type !== "reference" || !field.target) return undefined;
					const id = String(row.id ?? "");
					const target = field.target.split(".").at(-1);
					return id && target ? `/t/${target}/${id}` : undefined;
				},
			};
		});
	});
	const amountColumns = $derived(columns.filter((column) => isAmountPath(column.id)));
	const externalFilterIds = $derived(exposedFields.map((field) => field.key));
	const externalFilterCount = $derived(
		exposedFields.filter((field) => Boolean(exposedValues[field.key])).length,
	);

	let pending = $state<Array<Record<string, unknown>>>([]);

	function openRow(row: Record<string, unknown>) {
		const id = String(row.id ?? "");
		if (id) void goto(`/t/${typeKey}/${id}`);
	}

	function clearExposedFilters() {
		exposedValues = Object.fromEntries(exposedFields.map((field) => [field.key, ""]));
	}

	async function remove() {
		const targets = pending;
		pending = [];
		for (const row of targets) {
			const id = String(row.id ?? "");
			if (id) await canonicalStudio.deleteRecord(typeKey, id);
		}
		toast.success(targets.length > 1 ? `Deleted ${targets.length}` : "Deleted");
	}

	const pendingTitle = $derived.by(() => {
		if (pending.length === 1) {
			const row = pending[0];
			const key = columns[0]?.id ?? "id";
			return formatCell(key, row ? viewCellValue(view, row, key) : undefined);
		}
		if (pending.length > 1) return `${pending.length} records`;
		return "this";
	});
</script>

<DataTable
	{rows}
	{columns}
	{compact}
	createHref={aggregated ? undefined : createHref}
	createLabel={add}
	onCreate={aggregated ? undefined : onCreate}
	emptyTitle={emptyTitle ?? (type ? emptyCollectionTitle(type) : "Nothing here yet")}
	emptyDescription={emptyDescription ??
		(type ? emptyCollectionDescription(type) : "Add a record to get started.")}
	title={title ?? (compact || !type ? undefined : `All ${collectionLabel(type).toLowerCase()}`)}
	{actionHref}
	{actionLabel}
	searchPlaceholder={`Search ${type ? collectionLabel(type).toLowerCase() : "records"}`}
	{externalFilterIds}
	{externalFilterCount}
	clearExternalFilters={clearExposedFilters}
	onOpen={aggregated ? undefined : openRow}
	onDelete={aggregated ? undefined : (items) => (pending = items)}
>
	{#snippet filterControls()}
		<ViewExposeBar fields={exposedFields} bind:values={exposedValues} mode="panel" />
	{/snippet}
	{#snippet activeFilterControls()}
		<ViewExposeBar fields={exposedFields} bind:values={exposedValues} mode="active" />
	{/snippet}
	{#snippet cell({ row, column, value })}
		<FormattedValue
			path={column.id}
			{value}
			{type}
			badge={isStatusPath(column.id)}
			clamp={column.clamp}
			maximumFractionDigits={view.measures?.[column.id] ? 2 : undefined}
			ratingMax={aggregateRatingMax(view, type, column.id)}
			href={column.href?.(row)}
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
									const numeric = Number(viewCellValue(view, row, column.id));
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
