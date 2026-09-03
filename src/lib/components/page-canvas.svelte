<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import PageWidget from "$lib/components/page-widget.svelte";
	import WidgetPicker from "$lib/components/widget-picker.svelte";
	import WidgetSheet from "$lib/components/widget-sheet.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import type { PageBlock, PageDef } from "$lib/runtime/model.ts";
	import {
		appendInGroup,
		blockAt,
		collectViewKeys,
		emptyGroup,
		gridClass,
		insertBlock,
		normalizePage,
		removeBlock,
		setBlock,
		widgetBlock,
		widgetLabel,
		type WidgetDef,
	} from "$lib/runtime/widgets.ts";
	import CheckIcon from "@lucide/svelte/icons/check";
	import Columns2Icon from "@lucide/svelte/icons/columns-2";
	import Columns3Icon from "@lucide/svelte/icons/columns-3";
	import Columns4Icon from "@lucide/svelte/icons/columns-4";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SquareIcon from "@lucide/svelte/icons/square";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";


	let {
		page: current,
		title,
		description,
		editable = true,
	}: {
		page: PageDef;
		title: string;
		description?: string;
		editable?: boolean;
	} = $props();

	const spec = $derived(session.snapshot?.spec);
	let editing = $state(false);
	let draft = $state<PageBlock[]>([]);
	let pickerOpen = $state(false);
	let insertPath = $state<number[] | null>(null);
	let sheetOpen = $state(false);
	let editingPath = $state<number[] | null>(null);
	let viewRows = $state<Record<string, Array<Record<string, unknown>>>>({});
	let rowsReady = $state(false);

	const live = $derived(editing ? draft : normalizePage(current).blocks);
	const editingBlock = $derived(editingPath ? blockFrom(live, editingPath) : null);

	$effect(() => {
		void session.revision;
		void current.key;
		if (!editing) draft = normalizePage(current).blocks;
	});

	$effect(() => {
		void session.revision;
		const blocks = live;
		rowsReady = false;
		void (async () => {
			const next: Record<string, Array<Record<string, unknown>>> = {};
			for (const key of collectViewKeys(blocks)) {
				try {
					next[key] = await runtime().queryView(key);
				} catch (err) {
					console.warn("Couldn't load view", key, err);
					next[key] = [];
				}
			}
			viewRows = next;
			rowsReady = true;
		})();
	});

	function blockFrom(blocks: PageBlock[], path: number[]): PageBlock | null {
		let list = blocks;
		let found: PageBlock | undefined;
		for (const index of path) {
			found = list[index];
			if (!found) return null;
			list = found.kind === "group" ? found.blocks : [];
		}
		return found ?? null;
	}

	async function persist(next: PageBlock[]) {
		draft = next;
		editing = true;
		if (!spec) return;
		try {
			await runtime().upsertPage({
				...(current.id && current.id !== "pg_home" ? { id: current.id } : {}),
				key: current.key,
				label: current.label,
				path: current.path,
				blocks: JSON.parse(JSON.stringify(next)) as PageBlock[],
				implicit: false,
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the page");
		}
	}

	function startEdit() {
		draft = normalizePage(current).blocks;
		editing = true;
	}

	function stopEdit() {
		editing = false;
		pickerOpen = false;
		sheetOpen = false;
	}

	async function addGrid(columns: number) {
		await persist([...live, emptyGroup(columns)]);
		if (!editing) editing = true;
	}

	function openPicker(path: number[]) {
		insertPath = path;
		pickerOpen = true;
	}

	async function pickWidget(widget: WidgetDef) {
		if (!spec) return;
		const nextBlock = widgetBlock(widget, spec);
		const path = insertPath;
		insertPath = null;
		let next: PageBlock[];
		let createdPath: number[];
		if (!path?.length) {
			createdPath = [live.length, 0];
			next = [...live, { kind: "group", columns: 1, blocks: [nextBlock] }];
		} else {
			const group = blockAt(live, path);
			if (group?.kind === "group") {
				createdPath = [...path, group.blocks.length];
				next = appendInGroup(live, path, nextBlock);
			} else {
				createdPath = path;
				next = insertBlock(live, path, nextBlock);
			}
		}
		draft = next;
		editing = true;
		editingPath = createdPath;
		sheetOpen = true;
		await persist(next);
	}

	function openSheet(path: number[]) {
		editingPath = path;
		sheetOpen = true;
	}

	async function saveWidget(values: Record<string, unknown>) {
		if (!editingPath) return;
		const currentBlock = blockFrom(live, editingPath);
		if (currentBlock?.kind !== "widget") return;
		await persist(setBlock(live, editingPath, { ...currentBlock, values }));
		editingPath = null;
	}

	async function remove(path: number[]) {
		await persist(removeBlock(live, path));
	}

	const gridChoices = [
		{ columns: 1, label: "Full width", icon: SquareIcon },
		{ columns: 2, label: "2 columns", icon: Columns2Icon },
		{ columns: 3, label: "3 columns", icon: Columns3Icon },
		{ columns: 4, label: "4 columns", icon: Columns4Icon },
	];
</script>

<div class="flex flex-col gap-6">
	<PageHeader {title} {description}>
		{#snippet actions()}
			{#if editable}
				{#if editing}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="outline" {...props}>
									<PlusIcon data-icon="inline-start" />
									Add grid
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#each gridChoices as choice (choice.columns)}
								{@const Icon = choice.icon}
								<DropdownMenu.Item onSelect={() => addGrid(choice.columns)}>
									<Icon />
									{choice.label}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button onclick={stopEdit} data-testid="page-done">
						<CheckIcon data-icon="inline-start" />
						Done
					</Button>
				{:else}
					<Button variant="outline" onclick={startEdit} data-testid="page-edit">
						<PencilIcon data-icon="inline-start" />
						Edit
					</Button>
				{/if}
			{/if}
		{/snippet}
	</PageHeader>

	{#if !live.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><LayersIcon /></Empty.Media>
				<Empty.Title>Empty page</Empty.Title>
				<Empty.Description>
					{editing ? "Add a grid, then drop widgets into the cells." : "Edit this page to add widgets."}
				</Empty.Description>
			</Empty.Header>
			{#if editing}
				<Empty.Content>
					<Button onclick={() => addGrid(2)}>
						<PlusIcon data-icon="inline-start" />
						Add a 2-column grid
					</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{/if}

	{#each live as block, index (index)}
		{#if block.kind === "group"}
			<div class="flex flex-col gap-2">
				{#if editing}
					<div class="flex items-center justify-between gap-2">
						<p class="text-xs font-medium text-muted-foreground">
							{block.columns && block.columns > 1 ? `${block.columns}-column grid` : "Full width"}
						</p>
						<Button variant="ghost" size="icon-sm" onclick={() => remove([index])}>
							<Trash2Icon />
							<span class="sr-only">Remove grid</span>
						</Button>
					</div>
				{/if}
				<div class={gridClass(block.columns ?? 1)}>
					{#each block.blocks as child, childIndex (`${index}-${childIndex}`)}
						<div
							class={editing
								? "group/cell relative h-full min-h-0 rounded-xl ring-1 ring-transparent hover:ring-border"
								: "h-full min-h-0"}
						>
							{#if editing}
								<div class="absolute top-2 right-2 z-10 hidden gap-1 group-hover/cell:flex">
									<Button size="xs" variant="outline" onclick={() => openSheet([index, childIndex])}>
										Edit
									</Button>
									<Button
										size="icon-xs"
										variant="outline"
										onclick={() => remove([index, childIndex])}
									>
										<Trash2Icon />
										<span class="sr-only">Remove {widgetLabel(child)}</span>
									</Button>
								</div>
							{/if}
							<PageWidget block={child} rows={viewRows} ready={rowsReady} />
						</div>
					{/each}
					{#if editing}
						<button
							type="button"
							class="flex min-h-28 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
							onclick={() => openPicker([index])}
							data-testid="add-widget-slot"
						>
							<PlusIcon class="size-4" />
							Add widget
						</button>
					{/if}
				</div>
			</div>
		{:else}
			<div class={editing ? "group/cell relative h-full min-h-0 rounded-xl" : "h-full min-h-0"}>
				{#if editing}
					<div class="absolute top-2 right-2 z-10 hidden gap-1 group-hover/cell:flex">
						<Button size="xs" variant="outline" onclick={() => openSheet([index])}>Edit</Button>
						<Button size="icon-xs" variant="outline" onclick={() => remove([index])}>
							<Trash2Icon />
							<span class="sr-only">Remove</span>
						</Button>
					</div>
				{/if}
				<PageWidget {block} rows={viewRows} ready={rowsReady} />
			</div>
		{/if}
	{/each}
</div>

<WidgetPicker bind:open={pickerOpen} onPick={pickWidget} />
<WidgetSheet bind:open={sheetOpen} block={editingBlock} onSave={saveWidget} />
