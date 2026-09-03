<script lang="ts">
	import { goto } from "$app/navigation";
	import { columnLabel, fieldKindLabel } from "$lib/app/labels.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import AppSelect from "$lib/components/app-select.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import RecordTable from "$lib/components/record-table.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
	import { compactWhere, FILTER_OPS, normalizeFilters, type FilterOp } from "$lib/runtime/filters.ts";
	import { labelFromKey, slugify, uniqueKey } from "$lib/runtime/ids.ts";
	import { RECORD_ID_TOKEN } from "$lib/runtime/query.ts";
	import type { FieldKind, SortDirection, TypeDef, ViewDef, ViewMeasure } from "$lib/runtime/model.ts";
	import { cn } from "$lib/utils.js";
	import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
	import Columns3Icon from "@lucide/svelte/icons/columns-3";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import HashIcon from "@lucide/svelte/icons/hash";
	import LinkIcon from "@lucide/svelte/icons/link";
	import ListFilterIcon from "@lucide/svelte/icons/list-filter";
	import ListIcon from "@lucide/svelte/icons/list";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SigmaIcon from "@lucide/svelte/icons/sigma";
	import ToggleLeftIcon from "@lucide/svelte/icons/toggle-left";
	import TypeIcon from "@lucide/svelte/icons/type";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Component } from "svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	let { view }: { view: ViewDef } = $props();

	const kindIcons: Record<FieldKind, Component> = {
		text: TypeIcon,
		number: HashIcon,
		date: CalendarIcon,
		boolean: ToggleLeftIcon,
		enum: ListIcon,
		reference: LinkIcon,
	};

	type ColumnRow = { field: string; on: boolean };
	type SortRow = { field: string; dir: SortDirection };
	type MeasureRow = ViewMeasure & { key: string };

	const types = $derived(session.snapshot?.spec.types ?? []);

	let label = $state("");
	let source = $state("");
	let columns = $state<ColumnRow[]>([]);
	let filters = $state<Array<{ field: string; op: string; value: string }>>([]);
	let expose = $state<string[]>([]);
	let exposeOn = $state(false);
	let limit = $state("");
	let limitOn = $state(false);
	let sorts = $state<SortRow[]>([]);
	let summarize = $state(false);
	let groupBy = $state("");
	let measureRows = $state<MeasureRow[]>([]);
	let featured = $state(true);
	let deleteOpen = $state(false);
	let section = $state("filters");
	let previewOpen = $state(true);
	let previewExpose = $state<Record<string, string>>({});
	let dragField = $state<string | null>(null);
	let overField = $state<string | null>(null);
	let dragFilter = $state<number | null>(null);
	let overFilter = $state<number | null>(null);
	let dragSort = $state<number | null>(null);
	let overSort = $state<number | null>(null);

	const sourceType = $derived(
		types.find((item) => item.key === source) ?? types.find((item) => item.key === view.source),
	);
	const numericFields = $derived((sourceType?.fields ?? []).filter((field) => field.type === "number"));
	const measures = $derived(
		Object.fromEntries(
			measureRows
				.filter((measure) => measure.key)
				.map(({ key, ...measure }) => [key, measure]),
		),
	);
	const fieldChoices = $derived(
		summarize && groupBy ? [groupBy, ...Object.keys(measures)] : choicesFor(sourceType),
	);
	const selected = $derived(columns.filter((column) => column.on).map((column) => column.field));
	const previewExposeFields = $derived(
		exposeOn ? (sourceType?.fields ?? []).filter((field) => expose.includes(field.key)) : [],
	);
	const usesRecord = $derived(
		filters.some((clause) => clause.value === RECORD_ID_TOKEN),
	);

	$effect(() => {
		void view.key;
		untrack(() => {
			label = view.label;
			source = view.source;
			const type = types.find((item) => item.key === view.source);
			filters = normalizeFilters(view.where).map((clause) => ({
				field: clause.field,
				op: clause.op ?? "eq",
				value: Array.isArray(clause.value) ? clause.value.join(", ") : String(clause.value ?? ""),
			}));
			const nextExpose = [...(view.expose ?? [])];
			expose = nextExpose;
			exposeOn = nextExpose.length > 0;
			limit = view.limit ? String(view.limit) : "";
			limitOn = Boolean(view.limit);
			summarize = Boolean(view.group_by);
			groupBy = view.group_by ?? "";
			measureRows = Object.entries(view.measures ?? {}).map(([key, measure]) => ({
				key,
				...structuredClone(measure),
			}));
			columns = mergeColumns(
				[],
				groupBy ? [groupBy, ...measureRows.map((measure) => measure.key)] : choicesFor(type),
				view.fields,
			);
			sorts = Object.entries(view.order_by ?? {}).map(([field, dir]) => ({
				field,
				dir: dir === "desc" ? "desc" : "asc",
			}));
			featured = !view.implicit;
		});
	});

	$effect(() => {
		const choices = fieldChoices;
		if (!choices.length) return;
		untrack(() => {
			columns = mergeColumns(columns, choices);
		});
	});

	function choicesFor(type: TypeDef | undefined): string[] {
		return (type?.fields ?? []).map((field) =>
			field.type === "reference" ? `${field.key}.name` : field.key,
		);
	}

	function mergeColumns(current: ColumnRow[], choices: string[], preferredOn?: string[]): ColumnRow[] {
		const choiceSet = new Set(choices);
		const onSet = new Set(
			preferredOn !== undefined
				? preferredOn.filter((field) => choiceSet.has(field))
				: current.filter((column) => column.on).map((column) => column.field),
		);
		if (preferredOn !== undefined && !onSet.size) {
			for (const field of choices) onSet.add(field);
		}
		const seen = new Set<string>();
		const next: ColumnRow[] = [];
		const seed =
			preferredOn !== undefined
				? [
						...preferredOn
							.filter((field) => choiceSet.has(field))
							.map((field) => ({ field, on: true })),
						...current,
					]
				: current;
		for (const column of seed) {
			if (!choiceSet.has(column.field) || seen.has(column.field)) continue;
			seen.add(column.field);
			next.push({ field: column.field, on: onSet.has(column.field) });
		}
		for (const field of choices) {
			if (seen.has(field)) continue;
			next.push({ field, on: onSet.has(field) });
		}
		return next;
	}

	function fieldDef(key: string) {
		return sourceType?.fields.find((item) => item.key === key.split(".")[0]);
	}

	function columnKind(field: string): FieldKind {
		if (measures[field]) return "number";
		return fieldDef(field)?.type ?? "text";
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

	function setExposeOn(on: boolean) {
		if (!on) expose = [];
	}

	function setLimitOn(on: boolean) {
		if (on && !limit) limit = "25";
	}

	function setColumnOn(field: string, on: boolean) {
		if (!on && selected.length <= 1) return;
		columns = columns.map((column) => (column.field === field ? { ...column, on } : column));
	}

	function moveColumn(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= columns.length) return;
		const next = [...columns];
		const item = next[index];
		const swap = next[target];
		if (!item || !swap) return;
		next[index] = swap;
		next[target] = item;
		columns = next;
	}

	function onDragStart(field: string, event: DragEvent) {
		dragField = field;
		event.dataTransfer?.setData("text/plain", field);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
	}

	function onDragOver(field: string, event: DragEvent) {
		event.preventDefault();
		overField = field;
	}

	function onDrop(field: string) {
		if (!dragField || dragField === field) {
			dragField = null;
			overField = null;
			return;
		}
		const from = columns.findIndex((column) => column.field === dragField);
		const to = columns.findIndex((column) => column.field === field);
		if (from < 0 || to < 0) {
			dragField = null;
			overField = null;
			return;
		}
		const next = [...columns];
		const [item] = next.splice(from, 1);
		if (!item) return;
		next.splice(to, 0, item);
		columns = next;
		dragField = null;
		overField = null;
	}

	function moveItem<T>(list: T[], from: number, to: number): T[] {
		if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
		const next = [...list];
		const [item] = next.splice(from, 1);
		if (!item) return list;
		next.splice(to, 0, item);
		return next;
	}

	function onFilterDrop(index: number) {
		if (dragFilter == null) {
			overFilter = null;
			return;
		}
		filters = moveItem(filters, dragFilter, index);
		dragFilter = null;
		overFilter = null;
	}

	function onSortDrop(index: number) {
		if (dragSort == null) {
			overSort = null;
			return;
		}
		sorts = moveItem(sorts, dragSort, index);
		dragSort = null;
		overSort = null;
	}

	function sortFieldOptions(current: string) {
		const used = new Set(sorts.map((row) => row.field).filter((field) => field && field !== current));
		return [
			...(summarize && groupBy
				? fieldChoices.map((field) => ({ value: field, label: columnLabel(field, sourceType) }))
				: (sourceType?.fields ?? []).map((field) => ({ value: field.key, label: field.label }))),
			...(summarize && groupBy
				? []
				: [
						{ value: "updated_at", label: "Last updated" },
						{ value: "created_at", label: "Created" },
					]),
		].filter((option) => !used.has(option.value));
	}

	function addSort() {
		const next = sortFieldOptions("");
		if (!next[0]) return;
		sorts = [...sorts, { field: next[0].value, dir: "asc" }];
	}

	function removeSort(index: number) {
		sorts = sorts.filter((_, item) => item !== index);
	}

	function setSummarize(on: boolean) {
		summarize = on;
		if (!on) {
			const aliases = new Set(measureRows.map((measure) => measure.key));
			sorts = sorts.filter((sort) => !aliases.has(sort.field));
			columns = choicesFor(sourceType).map((field) => ({ field, on: true }));
			return;
		}
		groupBy ||= sourceType?.fields[0]?.key ?? "";
		if (!measureRows.length) addMeasure();
		columns = [groupBy, ...measureRows.map((measure) => measure.key)].map((field) => ({
			field,
			on: true,
		}));
	}

	function setGroupBy(field: string) {
		const previous = groupBy;
		groupBy = field;
		if (!field) return;
		const existing = columns.find((column) => column.field === previous);
		columns = [
			{ field, on: existing?.on ?? true },
			...columns.filter((column) => column.field !== previous && column.field !== field),
		];
		sorts = sorts.map((sort) => (sort.field === previous ? { ...sort, field } : sort));
	}

	function addMeasure() {
		const key = uniqueKey(
			`${source || "record"}_count`,
			measureRows.map((measure) => measure.key),
			"measure",
		);
		measureRows = [...measureRows, { key, op: "count" }];
		columns = [...columns, { field: key, on: true }];
	}

	function removeMeasure(index: number) {
		const removed = measureRows[index]?.key;
		measureRows = measureRows.filter((_, item) => item !== index);
		if (removed) {
			columns = columns.filter((column) => column.field !== removed);
			sorts = sorts.filter((sort) => sort.field !== removed);
		}
	}

	function updateMeasure(index: number, patch: Partial<MeasureRow>) {
		measureRows = measureRows.map((measure, item) =>
			item === index ? { ...measure, ...patch } : measure,
		);
	}

	function renameMeasure(index: number, value: string) {
		const current = measureRows[index];
		if (!current) return;
		const key = uniqueKey(
			slugify(value),
			measureRows.filter((_, item) => item !== index).map((measure) => measure.key),
			"measure",
		);
		if (key === current.key) return;
		updateMeasure(index, { key });
		columns = columns.map((column) =>
			column.field === current.key ? { ...column, field: key } : column,
		);
		sorts = sorts.map((sort) => (sort.field === current.key ? { ...sort, field: key } : sort));
	}

	function setMeasureOp(index: number, op: ViewMeasure["op"]) {
		const current = measureRows[index];
		if (!current) return;
		if (op === "count") {
			updateMeasure(index, { op, field: undefined, fields: undefined });
			return;
		}
		const selected = measureFields(current);
		const field = selected[0] ?? numericFields[0]?.key ?? "";
		updateMeasure(
			index,
			op === "avg"
				? { op, field: undefined, fields: field ? [field] : [] }
				: { op, field, fields: undefined },
		);
	}

	function measureFields(measure: ViewMeasure): string[] {
		return measure.fields?.length ? measure.fields : measure.field ? [measure.field] : [];
	}

	function toggleAverageField(index: number, field: string, on: boolean) {
		const current = measureRows[index];
		if (!current) return;
		const selected = measureFields(current);
		const fields = on
			? selected.includes(field)
				? selected
				: [...selected, field]
			: selected.filter((item) => item !== field);
		if (!fields.length) return;
		updateMeasure(index, { field: undefined, fields });
	}

	function builtOrder(): Record<string, SortDirection> | undefined {
		const usable = sorts.filter((row) => row.field);
		if (!usable.length) return undefined;
		return Object.fromEntries(usable.map((row) => [row.field, row.dir]));
	}

	function builtWhere(options: { preview?: boolean } = {}) {
		return compactWhere(
			filters
				.filter((clause) => {
					if (!clause.field) return false;
					if (options.preview && clause.value === RECORD_ID_TOKEN) return false;
					return !needsValue(clause.op) || clause.value !== "";
				})
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

	function sortDirLabels(field: string) {
		if (field === "created_at" || field === "updated_at" || fieldDef(field)?.type === "date") {
			return { asc: "Oldest first", desc: "Newest first" };
		}
		if (columnKind(field) === "number") {
			return { asc: "Low to high", desc: "High to low" };
		}
		return { asc: "A to Z", desc: "Z to A" };
	}

	async function save() {
		await runtime().upsertView({
			key: view.key,
			id: view.id,
			label,
			source,
			fields: [...selected],
			where: builtWhere(),
			expose: exposeOn && expose.length ? [...expose] : undefined,
			limit: limitOn ? Number(limit) || undefined : undefined,
			order_by: builtOrder(),
			group_by: summarize ? groupBy || undefined : undefined,
			measures: summarize && groupBy ? structuredClone(measures) : undefined,
			implicit: featured ? false : view.implicit,
		});
		toast.success("View saved");
	}

	async function duplicate() {
		const taken = session.snapshot?.spec.views.map((item) => item.key) ?? [];
		const key = uniqueKey(view.key, taken, "view");
		await runtime().upsertView({
			key,
			label: `${label || view.label} copy`,
			source,
			fields: [...selected],
			where: builtWhere(),
			expose: exposeOn && expose.length ? [...expose] : undefined,
			limit: limitOn ? Number(limit) || undefined : undefined,
			order_by: builtOrder(),
			group_by: summarize ? groupBy || undefined : undefined,
			measures: summarize && groupBy ? structuredClone(measures) : undefined,
			implicit: false,
		});
		toast.success("View duplicated");
		await goto(`/build/views/${key}`);
	}

	async function remove() {
		await runtime().deleteView(view.key);
		toast.success("View deleted");
		await goto("/build/views");
	}

	let preview = $state<Array<Record<string, unknown>> | null>(null);
	const previewView = $derived(
		({
			...view,
			label,
			source,
			fields: selected,
			where: builtWhere({ preview: true }),
			expose: exposeOn ? expose : undefined,
			limit: limitOn ? Number(limit) || undefined : undefined,
			order_by: builtOrder(),
			group_by: summarize ? groupBy || undefined : undefined,
			measures: summarize && groupBy ? measures : undefined,
		}) as ViewDef,
	);

	$effect(() => {
		const keys = previewExposeFields.map((field) => field.key);
		untrack(() => {
			const next: Record<string, string> = {};
			for (const key of keys) next[key] = previewExpose[key] ?? "";
			previewExpose = next;
		});
	});

	$effect(() => {
		void session.revision;
		const draft = previewView;
		const extra = Object.fromEntries(
			Object.entries(previewExpose).filter(([, value]) => value !== ""),
		);
		preview = null;
		let cancelled = false;
		const timer = setTimeout(() => {
			void runtime()
				.queryView(draft, extra)
				.then((rows) => {
					if (!cancelled) preview = rows;
				});
		}, 150);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

</script>

<div class="flex flex-col gap-8">
	<PageHeader
		title={label || view.label}
		description="A saved list. Change filters and columns here — the preview updates as you go."
	>
		{#snippet actions()}
			<Button variant="outline" onclick={duplicate}>
				<CopyIcon data-icon="inline-start" />
				Duplicate
			</Button>
			<Button onclick={save}>Save</Button>
			{#if !view.implicit}
				<Button variant="ghost" onclick={() => (deleteOpen = true)}>Delete</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<Card.Root class="h-auto">
		<Card.Header>
			<Card.Title>This list</Card.Title>
			<Card.Description>What it is called, which records it uses, and whether it appears in the menu.</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label for="view-name">Name</Field.Label>
					<Input id="view-name" bind:value={label} placeholder="Active projects" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Show records of</Field.Label>
					<AppSelect
						bind:value={source}
						options={types.map((item) => ({ value: item.key, label: item.label }))}
					/>
				</Field.Field>
			</div>
		</Card.Content>
		<Card.Footer>
			<Field.Field orientation="horizontal" class="w-auto">
				<Switch bind:checked={featured} id="featured" />
				<Field.Label for="featured" class="font-normal">Show in the app menu</Field.Label>
			</Field.Field>
		</Card.Footer>
	</Card.Root>

	<Card.Root class="h-auto">
		<Card.Header>
			<Card.Title>Query</Card.Title>
			<Card.Description>Narrow the records, choose columns, set the order, and cap how many.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-5">
			<Tabs.Root bind:value={section} class="gap-5">
				<Tabs.List
					class="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto p-1 group-data-horizontal/tabs:h-auto"
				>
					<Tabs.Trigger value="filters" class="h-8 flex-none gap-2 px-3">
						<ListFilterIcon data-icon="inline-start" class="hidden sm:block" />
						Filters
						{#if filters.length}
							<span class="text-xs text-muted-foreground tabular-nums">{filters.length}</span>
						{/if}
					</Tabs.Trigger>
					<Tabs.Trigger value="columns" class="h-8 flex-none gap-2 px-3">
						<Columns3Icon data-icon="inline-start" class="hidden sm:block" />
						Columns
					</Tabs.Trigger>
					<Tabs.Trigger value="summaries" class="h-8 flex-none gap-2 px-3">
						<SigmaIcon data-icon="inline-start" class="hidden sm:block" />
						Summaries
						{#if summarize && measureRows.length}
							<span class="text-xs text-muted-foreground tabular-nums">{measureRows.length}</span>
						{/if}
					</Tabs.Trigger>
					<Tabs.Trigger value="sort" class="h-8 flex-none gap-2 px-3">
						<ArrowUpDownIcon data-icon="inline-start" class="hidden sm:block" />
						Sort
						{#if sorts.length}
							<span class="text-xs text-muted-foreground tabular-nums">{sorts.length}</span>
						{/if}
					</Tabs.Trigger>
					<Tabs.Trigger value="advanced" class="h-8 flex-none gap-2 px-3">
						<Settings2Icon data-icon="inline-start" class="hidden sm:block" />
						Advanced
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="filters" class="flex flex-col gap-5">
					{#if !filters.length}
						<Empty.Root class="border border-dashed py-8">
							<Empty.Header>
								<Empty.Media variant="icon"><ListFilterIcon /></Empty.Media>
								<Empty.Title>All records</Empty.Title>
								<Empty.Description>
									Nothing is filtered yet. Add a condition to narrow this list — unpaid, active, overdue.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline" onclick={addFilter} disabled={!sourceType}>
									<PlusIcon data-icon="inline-start" />
									Add filter
								</Button>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<div class="flex flex-col gap-2" role="list">
							{#each filters as clause, index (index)}
								{@const def = fieldDef(clause.field)}
								{#if index > 0}
									<p class="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">And</p>
								{/if}
								<div
									role="listitem"
									class={cn(
										"grid items-center gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 md:grid-cols-[auto_minmax(0,1fr)_10rem_minmax(0,1.2fr)_auto]",
										dragFilter === index && "opacity-60",
										overFilter === index &&
											dragFilter != null &&
											dragFilter !== index &&
											"bg-primary/5 ring-primary/40",
									)}
									ondragover={(event) => {
										event.preventDefault();
										overFilter = index;
									}}
									ondrop={() => onFilterDrop(index)}
								>
									<button
										type="button"
										class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
										draggable="true"
										aria-label="Drag to reorder filter"
										ondragstart={(event) => {
											dragFilter = index;
											event.dataTransfer?.setData("text/plain", String(index));
											if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
										}}
										ondragend={() => {
											dragFilter = null;
											overFilter = null;
										}}
									>
										<GripVerticalIcon class="size-4" />
									</button>
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
										{#if def?.type === "enum" && clause.op !== "contains" && clause.op !== "in"}
											<AppSelect
												bind:value={clause.value}
												options={(def.values ?? []).map((value) => ({
													value,
													label: labelFromKey(value),
												}))}
											/>
										{:else if def?.type === "boolean"}
											<AppSelect
												bind:value={clause.value}
												options={[
													{ value: "true", label: "Yes" },
													{ value: "false", label: "No" },
												]}
											/>
										{:else if def?.type === "reference" && clause.op !== "contains" && clause.op !== "in"}
											<AppSelect
												bind:value={clause.value}
												options={[
													{ value: RECORD_ID_TOKEN, label: "This record" },
													...(clause.value && clause.value !== RECORD_ID_TOKEN
														? [{ value: clause.value, label: clause.value }]
														: []),
												]}
											/>
										{:else if def?.type === "date" && clause.op !== "contains" && clause.op !== "in"}
											<Input type="date" bind:value={clause.value} />
										{:else}
											<Input
												bind:value={clause.value}
												inputmode={def?.type === "number" ? "decimal" : "text"}
												placeholder={clause.op === "in" ? "sent, overdue" : "value"}
											/>
										{/if}
									{:else}
										<div class="hidden md:block"></div>
									{/if}
									<Button
										variant="ghost"
										size="icon-xs"
										onclick={() => removeFilter(index)}
										aria-label="Remove filter"
										class="justify-self-end"
									>
										<XIcon />
									</Button>
								</div>
							{/each}
							<div>
								<Button variant="outline" size="sm" onclick={addFilter}>
									<PlusIcon data-icon="inline-start" />
									Add filter
								</Button>
							</div>
						</div>
					{/if}

					<div class="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4 ring-1 ring-foreground/5">
						<Field.Field orientation="horizontal">
							<Switch bind:checked={exposeOn} onCheckedChange={(value) => setExposeOn(Boolean(value))} id="expose" />
							<Field.Content>
								<Field.Label for="expose">People can filter this list</Field.Label>
								<Field.Description>Controls appear above the list so anyone can narrow it.</Field.Description>
							</Field.Content>
						</Field.Field>
						{#if exposeOn && sourceType?.fields.length}
							<Field.FieldSet>
								<Field.FieldLegend variant="label">Which fields</Field.FieldLegend>
								<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
							</Field.FieldSet>
						{/if}
					</div>
				</Tabs.Content>

				<Tabs.Content value="columns" class="flex flex-col gap-3">
					<p class="text-sm text-muted-foreground">
						Drag to set the table order. Turn a column off to hide it. At least one stays on.
					</p>
					{#if columns.length}
						<div class="flex flex-col gap-2" role="list">
							{#each columns as column, index (column.field)}
								{@const kind = columnKind(column.field)}
								{@const Icon = kindIcons[kind] ?? TypeIcon}
								<div
									role="listitem"
									class={cn(
										"flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10",
										dragField === column.field && "opacity-60",
										overField === column.field && dragField && dragField !== column.field && "bg-primary/5 ring-primary/40",
										!column.on && "opacity-70",
									)}
									ondragover={(event) => onDragOver(column.field, event)}
									ondrop={() => onDrop(column.field)}
								>
									<button
										type="button"
										class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
										draggable="true"
										aria-label="Drag to reorder"
										ondragstart={(event) => onDragStart(column.field, event)}
										ondragend={() => {
											dragField = null;
											overField = null;
										}}
									>
										<GripVerticalIcon class="size-4" />
									</button>
									<Switch
										size="sm"
										checked={column.on}
										disabled={column.on && selected.length <= 1}
										onCheckedChange={(value) => setColumnOn(column.field, Boolean(value))}
										aria-label="Show {columnLabel(column.field, sourceType)}"
									/>
									<div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
										<Icon class="size-4" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="font-medium">{columnLabel(column.field, sourceType)}</div>
										<div class="text-sm text-muted-foreground">{fieldKindLabel[kind]}</div>
									</div>
									<Badge variant={column.on ? "secondary" : "outline"}>{column.on ? "On" : "Off"}</Badge>
									<div class="flex shrink-0 items-center">
										<Button
											size="icon-sm"
											variant="ghost"
											disabled={index === 0}
											onclick={() => moveColumn(index, -1)}
										>
											<ChevronUpIcon />
											<span class="sr-only">Move up</span>
										</Button>
										<Button
											size="icon-sm"
											variant="ghost"
											disabled={index === columns.length - 1}
											onclick={() => moveColumn(index, 1)}
										>
											<ChevronDownIcon />
											<span class="sr-only">Move down</span>
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="summaries" class="flex flex-col gap-5">
					<div class="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4 ring-1 ring-foreground/5">
						<Field.Field orientation="horizontal">
							<Switch
								checked={summarize}
								onCheckedChange={(value) => setSummarize(Boolean(value))}
								id="summarize"
							/>
							<Field.Content>
								<Field.Label for="summarize">Group and summarize records</Field.Label>
								<Field.Description>
									Return one row per group with live totals, averages, minimums, or maximums.
								</Field.Description>
							</Field.Content>
						</Field.Field>
						{#if summarize}
							<Field.Field>
								<Field.Label>Group by</Field.Label>
								<AppSelect
									value={groupBy}
									onValueChange={setGroupBy}
									options={(sourceType?.fields ?? []).map((field) => ({
										value: field.key,
										label: field.label,
									}))}
									placeholder="Choose a field"
								/>
								<Field.Description>
									Reference fields use the referenced record as the group and show its label.
								</Field.Description>
							</Field.Field>
						{/if}
					</div>

					{#if summarize}
						<div class="flex items-center justify-between gap-3">
							<div>
								<h3 class="font-medium">Summary columns</h3>
								<p class="text-sm text-muted-foreground">Each calculation becomes a column in the grouped list.</p>
							</div>
							<Button variant="outline" size="sm" onclick={addMeasure}>
								<PlusIcon data-icon="inline-start" />
								Add summary
							</Button>
						</div>

						{#if !measureRows.length}
							<Empty.Root class="border border-dashed py-8">
								<Empty.Header>
									<Empty.Media variant="icon"><SigmaIcon /></Empty.Media>
									<Empty.Title>No summary columns</Empty.Title>
									<Empty.Description>Add a count, total, average, minimum, or maximum.</Empty.Description>
								</Empty.Header>
								<Empty.Content>
									<Button variant="outline" onclick={addMeasure}>
										<PlusIcon data-icon="inline-start" />
										Add summary
									</Button>
								</Empty.Content>
							</Empty.Root>
						{:else}
							<div class="flex flex-col gap-3">
								{#each measureRows as measure, index (index)}
									<div class="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
										<div class="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
											<Field.Field>
												<Field.Label for="measure-{index}">Column name</Field.Label>
												<Input
													id="measure-{index}"
													value={measure.key}
													onchange={(event) => renameMeasure(index, event.currentTarget.value)}
													placeholder="overall_score"
												/>
											</Field.Field>
											<Field.Field>
												<Field.Label>Calculation</Field.Label>
												<AppSelect
													value={measure.op}
													onValueChange={(value) => setMeasureOp(index, value as ViewMeasure["op"])}
													options={[
														{ value: "count", label: "Count" },
														...(numericFields.length
															? [
																{ value: "sum", label: "Sum" },
																{ value: "avg", label: "Average" },
																{ value: "min", label: "Minimum" },
																{ value: "max", label: "Maximum" },
															]
															: []),
													]}
												/>
											</Field.Field>
											<Button
												variant="ghost"
												size="icon-sm"
												onclick={() => removeMeasure(index)}
												aria-label="Remove {labelFromKey(measure.key)} summary"
											>
												<XIcon />
											</Button>
										</div>

										{#if measure.op === "avg"}
											<Field.FieldSet>
												<Field.FieldLegend variant="label">Fields to average</Field.FieldLegend>
												<Field.Description>
													With several fields, each record is averaged first, then the group is averaged.
												</Field.Description>
												<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
													{#each numericFields as field (field.key)}
														<Field.Field orientation="horizontal">
															<Checkbox
																checked={measureFields(measure).includes(field.key)}
																disabled={measureFields(measure).length === 1 && measureFields(measure).includes(field.key)}
																onCheckedChange={(value) =>
																	toggleAverageField(index, field.key, Boolean(value))}
															/>
															<Field.Label class="font-normal">{field.label}</Field.Label>
														</Field.Field>
													{/each}
												</div>
											</Field.FieldSet>
										{:else if measure.op !== "count"}
											<Field.Field>
												<Field.Label>Number field</Field.Label>
												<AppSelect
													value={measure.field ?? ""}
													onValueChange={(value) => updateMeasure(index, { field: value })}
													options={numericFields.map((field) => ({ value: field.key, label: field.label }))}
													placeholder="Choose a number field"
												/>
											</Field.Field>
										{:else}
											<p class="text-sm text-muted-foreground">Counts every record in the group.</p>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</Tabs.Content>

				<Tabs.Content value="sort" class="flex flex-col gap-3">
					{#if !sorts.length}
						<Empty.Root class="border border-dashed py-8">
							<Empty.Header>
								<Empty.Media variant="icon"><ArrowUpDownIcon /></Empty.Media>
								<Empty.Title>Default order</Empty.Title>
								<Empty.Description>
									Records keep their usual order. Add a sort to put newest, largest, or A–Z first — then another
									for ties.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline" onclick={addSort} disabled={!sourceType}>
									<PlusIcon data-icon="inline-start" />
									Add sort
								</Button>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<div class="flex flex-col gap-2" role="list">
							{#each sorts as row, index (index)}
								{@const dirs = sortDirLabels(row.field)}
								{#if index > 0}
									<p class="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Then by</p>
								{/if}
								<div
									role="listitem"
									class={cn(
										"grid items-center gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
										dragSort === index && "opacity-60",
										overSort === index &&
											dragSort != null &&
											dragSort !== index &&
											"bg-primary/5 ring-primary/40",
									)}
									ondragover={(event) => {
										event.preventDefault();
										overSort = index;
									}}
									ondrop={() => onSortDrop(index)}
								>
									<button
										type="button"
										class="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
										draggable="true"
										aria-label="Drag to reorder sort"
										ondragstart={(event) => {
											dragSort = index;
											event.dataTransfer?.setData("text/plain", String(index));
											if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
										}}
										ondragend={() => {
											dragSort = null;
											overSort = null;
										}}
									>
										<GripVerticalIcon class="size-4" />
									</button>
									<AppSelect bind:value={row.field} options={sortFieldOptions(row.field)} />
									<ToggleGroup.Root type="single" bind:value={row.dir} variant="outline">
										<ToggleGroup.Item value="asc">{dirs.asc}</ToggleGroup.Item>
										<ToggleGroup.Item value="desc">{dirs.desc}</ToggleGroup.Item>
									</ToggleGroup.Root>
									<Button
										variant="ghost"
										size="icon-xs"
										onclick={() => removeSort(index)}
										aria-label="Remove sort"
									>
										<XIcon />
									</Button>
								</div>
							{/each}
							{#if sortFieldOptions("").length}
								<div>
									<Button variant="outline" size="sm" onclick={addSort}>
										<PlusIcon data-icon="inline-start" />
										Then by
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="advanced" class="flex flex-col gap-4">
					<div class="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4 ring-1 ring-foreground/5">
						<Field.Field orientation="horizontal">
							<Switch bind:checked={limitOn} onCheckedChange={(value) => setLimitOn(Boolean(value))} id="limit" />
							<Field.Content>
								<Field.Label for="limit">Limit results</Field.Label>
								<Field.Description>
									Caps how many matching records this list returns. Sort still applies first.
								</Field.Description>
							</Field.Content>
						</Field.Field>
						{#if limitOn}
							<Field.Field>
								<Field.Label for="limit-count">How many</Field.Label>
								<Input id="limit-count" bind:value={limit} inputmode="numeric" placeholder="25" class="max-w-48" />
							</Field.Field>
						{/if}
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root class="h-auto">
		<Collapsible.Root bind:open={previewOpen}>
			<Card.Header class="p-0">
				<Collapsible.Trigger
					class="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-start hover:bg-muted/40"
				>
					<span class="flex min-w-0 flex-col gap-1">
						<span class="font-heading text-base font-medium">Preview</span>
						<span class="text-sm text-muted-foreground">
							Live results from the query above. Nothing is saved until you press Save.
						</span>
					</span>
					<span class="flex shrink-0 items-center gap-2">
						<Badge variant="secondary">{preview == null ? "…" : `${preview.length}`}</Badge>
						<ChevronDownIcon
							class="size-4 text-muted-foreground transition-transform {previewOpen ? 'rotate-180' : ''}"
						/>
					</span>
				</Collapsible.Trigger>
			</Card.Header>
			<Collapsible.Content>
				<Card.Content class="flex flex-col gap-4">
					{#if usesRecord}
						<p class="text-sm text-muted-foreground">
							This list is filtered by the record you open it from. Preview shows the rest of the query
							without that.
						</p>
					{/if}
					<RecordTable
						rows={preview}
						view={previewView}
						typeKey={source}
						exposedFields={previewExposeFields}
						bind:exposedValues={previewExpose}
						compact
					/>
				</Card.Content>
			</Collapsible.Content>
		</Collapsible.Root>
	</Card.Root>
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
