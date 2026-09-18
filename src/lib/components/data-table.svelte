<script lang="ts">
	import { isStatusPath, semanticDotClass, statusDotClass } from "$lib/app/labels.ts";
	import OptionSelect from "@jthum/framework/svelte/studio/option-select";
	import { cellValue, compareRows, rowId, type DataTableColumn } from "$lib/components/data-table.ts";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import { Checkbox } from "@jthum/framework/svelte/ui/checkbox";
	import * as DropdownMenu from "@jthum/framework/svelte/ui/dropdown-menu";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import * as InputGroup from "@jthum/framework/svelte/ui/input-group";
	import * as Pagination from "@jthum/framework/svelte/ui/pagination";
	import * as Popover from "@jthum/framework/svelte/ui/popover";
	import { Skeleton } from "@jthum/framework/svelte/ui/skeleton";
	import * as Table from "@jthum/framework/svelte/ui/table";
	import { labelFromKey } from "$lib/runtime/ids.ts";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import Columns3Icon from "@lucide/svelte/icons/columns-3";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import ListFilterIcon from "@lucide/svelte/icons/list-filter";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils.ts";

	const anyFilter = "all";

	let {
		rows,
		columns,
		title,
		createHref,
		createLabel = "Add",
		emptyTitle = "Nothing here yet",
		emptyDescription = "Add a record to get started.",
		searchPlaceholder = "Search",
		compact = false,
		actionHref,
		actionLabel = "View all",
		onOpen,
		onCreate,
		onDelete,
		externalFilterIds = [],
		externalFilterCount = 0,
		filterControls,
		activeFilterControls,
		clearExternalFilters,
		footer,
		cell,
	}: {
		rows: Array<Record<string, unknown>> | null;
		columns: DataTableColumn[];
		title?: string;
		createHref?: string;
		createLabel?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		searchPlaceholder?: string;
		compact?: boolean;
		actionHref?: string;
		actionLabel?: string;
		onOpen?: (row: Record<string, unknown>) => void;
		onCreate?: () => void;
		onDelete?: (rows: Array<Record<string, unknown>>) => void;
		externalFilterIds?: string[];
		externalFilterCount?: number;
		filterControls?: Snippet;
		activeFilterControls?: Snippet;
		clearExternalFilters?: () => void;
		footer?: Snippet<[{ rows: Array<Record<string, unknown>>; columns: DataTableColumn[] }]>;
		cell?: Snippet<
			[{ row: Record<string, unknown>; column: DataTableColumn; value: unknown; index: number }]
		>;
	} = $props();

	let query = $state("");
	let filters = $state<Record<string, string>>({});
	let sortKey = $state("");
	let sortDir = $state<"asc" | "desc">("asc");
	let hidden = $state<Record<string, boolean>>({});
	let selected = $state<Record<string, boolean>>({});
	let page = $state(1);
	let pageSizeKey = $state("10");
	const pageSize = $derived(compact ? 5 : Number(pageSizeKey) || 10);

	const visible = $derived(columns.filter((column) => !hidden[column.id]));
	const filterColumns = $derived(
		columns.filter(
			(column) =>
				(column.filterValues?.length ?? 0) > 0 && !externalFilterIds.includes(column.id),
		),
	);
	const activeFilters = $derived(
		filterColumns.filter((column) => Boolean(filters[column.id])).map((column) => ({
			id: column.id,
			label: column.label,
			value: filters[column.id],
		})),
	);
	const hasLocalQuery = $derived(Boolean(query.trim() || activeFilters.length));
	const hasQuery = $derived(hasLocalQuery || externalFilterCount > 0);
	const visibleFilterColumns = $derived(compact ? [] : filterColumns);
	const activeFilterCount = $derived(activeFilters.length + externalFilterCount);
	const hasAvailableFilters = $derived(
		visibleFilterColumns.length > 0 || externalFilterIds.length > 0,
	);

	const filtered = $derived.by(() => {
		if (!rows) return null;
		const needle = query.trim().toLowerCase();
		return rows.filter((row) => {
			for (const column of filterColumns) {
				const wanted = filters[column.id];
				if (wanted && String(cellValue(row, column) ?? "") !== wanted) return false;
			}
			if (!needle) return true;
			return visible.some((column) =>
				String(cellValue(row, column) ?? "")
					.toLowerCase()
					.includes(needle),
			);
		});
	});

	const sorted = $derived.by(() => {
		const list = filtered ?? [];
		const column = columns.find((item) => item.id === sortKey);
		if (!column) return list;
		return [...list].sort((left, right) => compareRows(left, right, column, sortDir));
	});

	const pageCount = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
	const pageRows = $derived(sorted.slice((page - 1) * pageSize, page * pageSize));
	const selectedRows = $derived((filtered ?? []).filter((row) => selected[rowId(row)]));
	const selectedCount = $derived(selectedRows.length);
	const pageIds = $derived(pageRows.map(rowId).filter(Boolean));
	const allPageSelected = $derived(pageIds.length > 0 && pageIds.every((id) => selected[id]));
	const somePageSelected = $derived(pageIds.some((id) => selected[id]));
	const rangeStart = $derived(sorted.length === 0 ? 0 : (page - 1) * pageSize + 1);
	const rangeEnd = $derived(Math.min(page * pageSize, sorted.length));
	const totalCount = $derived(rows?.length ?? 0);
	const canCreate = $derived(Boolean(onCreate || createHref));
	const showToolbar = $derived(
		Boolean(
			title ||
				actionHref ||
				selectedCount ||
				hasAvailableFilters ||
				!compact ||
				(compact && canCreate && sorted.length > 0),
		),
	);

	$effect(() => {
		void query;
		void filters;
		void sortKey;
		void sortDir;
		void pageSize;
		void rows;
		page = 1;
	});

	$effect(() => {
		if (page > pageCount) page = pageCount;
	});

	function toggleSort(id: string) {
		if (sortKey === id) sortDir = sortDir === "asc" ? "desc" : "asc";
		else {
			sortKey = id;
			sortDir = "asc";
		}
	}

	function setFilter(id: string, value: string) {
		filters = { ...filters, [id]: value };
	}

	function toggleHidden(id: string, hide: boolean) {
		if (hide && visible.length <= 1) return;
		hidden = { ...hidden, [id]: hide };
	}

	function toggleRow(id: string, on: boolean) {
		if (!id) return;
		const next = { ...selected };
		if (on) next[id] = true;
		else delete next[id];
		selected = next;
	}

	function togglePage(on: boolean) {
		const next = { ...selected };
		for (const id of pageIds) {
			if (on) next[id] = true;
			else delete next[id];
		}
		selected = next;
	}

	function clearSelection() {
		selected = {};
	}

	function clearFilters() {
		query = "";
		filters = {};
		clearExternalFilters?.();
	}

	function openRow(row: Record<string, unknown>) {
		onOpen?.(row);
	}

	function filterLabel(column: DataTableColumn): string {
		const current = filters[column.id];
		if (current) return labelFromKey(current);
		return `Any ${column.label.toLowerCase()}`;
	}

	function filterDotClass(column: DataTableColumn, value: string): string | undefined {
		const semantic = column.valueSemantics?.[value];
		if (semantic) return semanticDotClass(semantic);
		return isStatusPath(column.id) ? statusDotClass(value) : undefined;
	}

</script>

{#snippet createButton(size?: "sm" | "default")}
	{#if onCreate}
		<Button type="button" {size} onclick={onCreate}>
			<PlusIcon data-icon="inline-start" />
			{createLabel}
		</Button>
	{:else if createHref}
		<Button href={createHref} {size}>
			<PlusIcon data-icon="inline-start" />
			{createLabel}
		</Button>
	{/if}
{/snippet}

<div class="flex flex-col gap-3">
	{#if showToolbar}
		<div class="flex flex-wrap items-center gap-2">
			{#if title || selectedCount}
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					{#if title}
						<p class="text-sm font-medium tracking-tight">{title}</p>
						{#if rows}
							<Badge variant="secondary">
								{hasQuery ? `${sorted.length}/${totalCount}` : totalCount}
							</Badge>
						{/if}
					{/if}
					{#if selectedCount}
						{#if title}
							<span class="h-4 w-px bg-border"></span>
						{/if}
						<span class="text-sm text-muted-foreground">{selectedCount} selected</span>
						{#if onDelete}
							<Button size="sm" variant="destructive-outline" onclick={() => onDelete(selectedRows)}>Delete</Button>
						{/if}
						<Button size="sm" variant="ghost" onclick={clearSelection}>Clear</Button>
					{/if}
				</div>
			{/if}

			<div class="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
				{@render activeFilterControls?.()}
				{#each activeFilters as active (active.id)}
					{@const column = filterColumns.find((item) => item.id === active.id)}
					{@const dot = column ? filterDotClass(column, active.value) : undefined}
					<Badge variant="outline" class="h-8 gap-1.5 bg-background pr-1 pl-2.5 text-sm font-normal">
						{#if dot}<span class="size-1.5 rounded-full {dot}"></span>{/if}
						<span class="text-muted-foreground">{active.label}:</span>
						{labelFromKey(active.value)}
						<Button
							variant="ghost"
							size="icon-xs"
							onclick={() => setFilter(active.id, "")}
							aria-label={`Clear ${active.label.toLowerCase()} filter`}
						>
							<XIcon />
						</Button>
					</Badge>
				{/each}

				{#if hasAvailableFilters}
					<Popover.Root>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button variant="outline" size="sm" {...props}>
									<ListFilterIcon data-icon="inline-start" />
									Filters
									{#if activeFilterCount}
										<Badge variant="secondary" class="ms-0.5 px-1.5">{activeFilterCount}</Badge>
									{/if}
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content align="start" class="w-[min(24rem,calc(100vw-2rem))] gap-3">
							<div class="flex items-start justify-between gap-3">
								<Popover.Header>
									<Popover.Title>Filters</Popover.Title>
									<Popover.Description>Choose which records appear in this table.</Popover.Description>
								</Popover.Header>
								{#if activeFilterCount}
									<Button variant="ghost" size="xs" onclick={clearFilters}>Clear all</Button>
								{/if}
							</div>
							{@render filterControls?.()}
							{#each visibleFilterColumns as column (column.id)}
								<div class="flex flex-col gap-1.5">
									<span class="text-xs font-medium text-muted-foreground">{column.label}</span>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="outline" size="sm" class="w-full justify-between" {...props}>
													{filterLabel(column)}
													<ChevronDownIcon data-icon="inline-end" class="text-muted-foreground" />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="w-auto min-w-52">
											<DropdownMenu.RadioGroup
												value={filters[column.id] || anyFilter}
												onValueChange={(value) =>
													setFilter(column.id, value === anyFilter ? "" : value)}
											>
												<DropdownMenu.RadioItem value={anyFilter}>Any {column.label.toLowerCase()}</DropdownMenu.RadioItem>
												{#each column.filterValues ?? [] as value (value)}
													{@const optionDot = filterDotClass(column, value)}
													<DropdownMenu.RadioItem value={value}>
														{#if optionDot}<span class="size-1.5 rounded-full {optionDot}"></span>{/if}
														{labelFromKey(value)}
													</DropdownMenu.RadioItem>
												{/each}
											</DropdownMenu.RadioGroup>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							{/each}
						</Popover.Content>
					</Popover.Root>
				{/if}

				{#if !compact}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="outline" size="sm" {...props}>
									<Columns3Icon data-icon="inline-start" />
									Columns
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-auto min-w-52">
							<DropdownMenu.Label>Visible columns</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								{#each columns as column (column.id)}
									<DropdownMenu.CheckboxItem
										checked={!hidden[column.id]}
										onCheckedChange={(value) => toggleHidden(column.id, !value)}
									>
										{column.label}
									</DropdownMenu.CheckboxItem>
								{/each}
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>

					<InputGroup.Root class="h-8 min-w-44 flex-1 bg-background sm:max-w-56 sm:flex-none">
						<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
						<InputGroup.Input bind:value={query} placeholder={searchPlaceholder} />
						{#if query}
							<InputGroup.Addon align="inline-end">
								<InputGroup.Button size="icon-xs" onclick={() => (query = "")} aria-label="Clear search">
									<XIcon />
								</InputGroup.Button>
							</InputGroup.Addon>
						{/if}
					</InputGroup.Root>
				{/if}

				{#if actionHref}
					<Button href={actionHref} size="sm" variant={compact ? "outline" : "ghost"}>
						{actionLabel}
						<ChevronRightIcon data-icon="inline-end" />
					</Button>
				{/if}
				{#if compact && canCreate && sorted.length > 0}
					{@render createButton("sm")}
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex flex-col gap-[2px] overflow-hidden [--chrome:4px] [--frame-radius:var(--radius-2xl)]">
		{#if rows === null}
			<div
				class="flex flex-col gap-2 rounded-[calc(var(--frame-radius)-var(--chrome))] bg-card p-4 shadow-xs"
			>
				<Skeleton class="h-10 w-full" />
				<Skeleton class="h-10 w-full" />
				<Skeleton class="h-10 w-full" />
			</div>
		{:else if sorted.length === 0}
			<Empty.Root
				class="rounded-[calc(var(--frame-radius)-var(--chrome))] border-0 bg-card shadow-xs {compact
					? 'py-8'
					: 'py-12'}"
			>
				<Empty.Header>
					<Empty.Media variant="icon">
						<InboxIcon />
					</Empty.Media>
					<Empty.Title>{hasQuery ? "No matches" : emptyTitle}</Empty.Title>
					<Empty.Description>
						{hasQuery ? "Try a different search or clear the filters." : emptyDescription}
					</Empty.Description>
				</Empty.Header>
				{#if canCreate && !hasQuery}
					<Empty.Content>
						{@render createButton()}
					</Empty.Content>
				{/if}
			</Empty.Root>
		{:else}
			<Table.Root
				class="overflow-hidden rounded-2xl bg-surface-chrome p-[4px] [border-collapse:separate] [border-spacing:0]"
			>
				<Table.Header class="bg-transparent">
					<Table.Row>
						{#if !compact}
							<Table.Head class="w-10">
								<Checkbox
									checked={allPageSelected}
									indeterminate={somePageSelected && !allPageSelected}
									onCheckedChange={(value) => togglePage(Boolean(value))}
									aria-label="Select all"
								/>
							</Table.Head>
						{/if}
						{#each visible as column (column.id)}
							<Table.Head class={column.numeric ? "text-end" : undefined}>
								{#if !compact && column.sortable !== false}
									<button
										type="button"
										class="inline-flex items-center gap-1 hover:text-foreground {column.numeric ? 'ms-auto' : ''}"
										onclick={() => toggleSort(column.id)}
									>
										{column.label}
										<ChevronDownIcon
											class="size-3.5 {sortKey === column.id
												? 'text-foreground'
												: 'text-muted-foreground/50'} {sortKey === column.id && sortDir === 'asc'
												? 'rotate-180'
												: ''}"
										/>
									</button>
								{:else}
									{column.label}
								{/if}
							</Table.Head>
						{/each}
						{#if !compact}
							<Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body
					class="bg-transparent drop-shadow-xs [&_td]:bg-card [&_tr:not(:last-child)>td]:border-b [&_tr:not(:last-child)>td]:border-border/60 [&_tr:hover>td]:bg-muted/40 [&_tr[data-state=selected]>td]:bg-muted/50 [&_tr[data-state=selected]:hover>td]:bg-muted/60 [&_tr:first-child>td:first-child]:rounded-tl-[calc(var(--frame-radius)-var(--chrome))] [&_tr:first-child>td:last-child]:rounded-tr-[calc(var(--frame-radius)-var(--chrome))] [&_tr:last-child>td:first-child]:rounded-bl-[calc(var(--frame-radius)-var(--chrome))] [&_tr:last-child>td:last-child]:rounded-br-[calc(var(--frame-radius)-var(--chrome))]"
				>
					{#each pageRows as row, index (rowId(row) || index)}
						{@const id = rowId(row)}
						<Table.Row
							class={onOpen ? "cursor-pointer" : undefined}
							data-state={selected[id] ? "selected" : undefined}
							onclick={() => openRow(row)}
						>
							{#if !compact}
								<Table.Cell class="py-1.5" onclick={(event) => event.stopPropagation()}>
									<Checkbox
										checked={Boolean(selected[id])}
										onCheckedChange={(value) => toggleRow(id, Boolean(value))}
										aria-label="Select row"
									/>
								</Table.Cell>
							{/if}
							{#each visible as column, columnIndex (column.id)}
								{@const value = cellValue(row, column)}
								<Table.Cell class={cn(column.numeric && "text-end tabular-nums")}>
									{#if cell}
										{@render cell({ row, column, value, index: columnIndex })}
									{:else}
										{value == null || value === "" ? "—" : String(value)}
									{/if}
								</Table.Cell>
							{/each}
							{#if !compact}
								<Table.Cell class="py-1.5" onclick={(event) => event.stopPropagation()}>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="ghost" size="icon-sm" {...props}>
													<EllipsisIcon />
													<span class="sr-only">Open menu</span>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="min-w-40">
											{#if onOpen}
												<DropdownMenu.Item onSelect={() => openRow(row)}>Open</DropdownMenu.Item>
											{/if}
											{#if onDelete}
												<DropdownMenu.Item variant="destructive" onSelect={() => onDelete([row])}>
													Delete
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
				{#if footer && !compact}
					<Table.Footer class="bg-transparent">
						{@render footer({ rows: sorted, columns: visible })}
					</Table.Footer>
				{/if}
			</Table.Root>
		{/if}
	</div>

	{#if !compact}
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted-foreground">
			{#if rows === null}
				Loading
			{:else if sorted.length === 0}
				0 rows
			{:else}
				{rangeStart}–{rangeEnd} of {sorted.length}
			{/if}
		</p>
		<div class="flex flex-wrap items-center gap-3">
			{#if sorted.length > 0}
				<div class="flex items-center gap-2">
					<span class="text-sm text-muted-foreground">Rows</span>
					<OptionSelect
						bind:value={pageSizeKey}
						options={[
							{ value: "10", label: "10" },
							{ value: "25", label: "25" },
							{ value: "50", label: "50" },
						]}
						class="h-8 w-[4.5rem]"
					/>
				</div>
			{/if}
			{#if sorted.length > pageSize}
				<Pagination.Root
					count={sorted.length}
					perPage={pageSize}
					bind:page
					class="mx-0 w-auto justify-end"
				>
					{#snippet children({ pages, currentPage })}
						<Pagination.Content>
							<Pagination.Item>
								<Pagination.Previous />
							</Pagination.Item>
							{#each pages as item (item.key)}
								{#if item.type === "ellipsis"}
									<Pagination.Item>
										<Pagination.Ellipsis />
									</Pagination.Item>
								{:else}
									<Pagination.Item>
										<Pagination.Link page={item} isActive={currentPage === item.value}>
											{item.value}
										</Pagination.Link>
									</Pagination.Item>
								{/if}
							{/each}
							<Pagination.Item>
								<Pagination.Next />
							</Pagination.Item>
						</Pagination.Content>
					{/snippet}
				</Pagination.Root>
			{/if}
		</div>
	</div>
	{/if}
</div>
