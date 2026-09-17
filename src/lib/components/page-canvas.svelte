<script lang="ts">
	import { goto } from "$app/navigation";
	import PageHeader from "$lib/components/page-header.svelte";
	import Block from "$lib/components/block.svelte";
	import BlockPicker from "$lib/components/block-picker.svelte";
	import BlockSettings from "$lib/components/block-settings.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import type { AppSpec, PageLayoutNode, PageDef, PageRowHeight } from "$lib/runtime/model.ts";
	import {
		appendInGroup,
		blockAt,
		collectViewKeys,
		emptyGroup,
		gridClass,
		groupHeightClass,
		insertBlock,
		moveInGroup,
		moveSibling,
		normalizePage,
		removeBlock,
		setBlock,
		setGroupColumns,
		setGroupMinHeight,
		createBlockNode,
		blockLabel,
		type BlockDefinition,
	} from "$lib/runtime/blocks.ts";
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
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
		startEditing = false,
		spec,
		revision,
		queryView,
		upsertPage,
	}: {
		page: PageDef;
		title: string;
		description?: string;
		editable?: boolean;
		startEditing?: boolean;
		spec?: AppSpec;
		revision: number;
		queryView: (key: string) => Promise<Array<Record<string, unknown>>>;
		upsertPage: (draft: Partial<PageDef> & { key: string }) => Promise<PageDef>;
	} = $props();

	let editing = $state(false);
	let draft = $state<PageLayoutNode[]>([]);
	let draftPageKey = "";
	let pickerOpen = $state(false);
	let insertPath = $state<number[] | null>(null);
	let sheetOpen = $state(false);
	let editingPath = $state<number[] | null>(null);
	let viewRows = $state<Record<string, Array<Record<string, unknown>>>>({});
	let rowsReady = $state(false);

	const live = $derived(editing ? draft : normalizePage(current).blocks);
	const editingBlock = $derived(editingPath ? blockFrom(live, editingPath) : null);

	$effect(() => {
		if (startEditing) editing = true;
	});

	$effect(() => {
		void revision;
		void current.key;
		if (!editing || draftPageKey !== current.key) {
			draft = normalizePage(current).blocks;
			draftPageKey = current.key;
		}
	});

	$effect(() => {
		void revision;
		const blocks = live;
		rowsReady = false;
		void (async () => {
			const next: Record<string, Array<Record<string, unknown>>> = {};
			for (const key of collectViewKeys(blocks)) {
				try {
					next[key] = await queryView(key);
				} catch (err) {
					console.warn("Couldn't load view", key, err);
					next[key] = [];
				}
			}
			viewRows = next;
			rowsReady = true;
		})();
	});

	function blockFrom(blocks: PageLayoutNode[], path: number[]): PageLayoutNode | null {
		let list = blocks;
		let found: PageLayoutNode | undefined;
		for (const index of path) {
			found = list[index];
			if (!found) return null;
			list = found.kind === "group" ? found.blocks : [];
		}
		return found ?? null;
	}

	async function persist(next: PageLayoutNode[]) {
		draft = next;
		draftPageKey = current.key;
		editing = true;
		if (!spec) return;
		try {
			await upsertPage({
				...(current.id && current.id !== "pg_home" ? { id: current.id } : {}),
				key: current.key,
				label: current.label,
				path: current.path,
				blocks: JSON.parse(JSON.stringify(next)) as PageLayoutNode[],
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
		if (startEditing && typeof location !== "undefined") {
			void goto(location.pathname, { replace: true, shallow: true });
		}
	}

	async function addGrid(columns: number) {
		await persist([...live, emptyGroup(columns)]);
		if (!editing) editing = true;
	}

	function openPicker(path: number[]) {
		insertPath = path;
		pickerOpen = true;
	}

	async function pickBlock(block: BlockDefinition) {
		if (!spec) return;
		const nextBlock = createBlockNode(block, spec);
		const path = insertPath;
		insertPath = null;
		let next: PageLayoutNode[];
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

	async function saveBlock(config: Record<string, unknown>) {
		if (!editingPath) return;
		const currentBlock = blockFrom(live, editingPath);
		if (currentBlock?.kind !== "block") return;
		await persist(setBlock(live, editingPath, { ...currentBlock, config }));
		editingPath = null;
	}

	async function remove(path: number[]) {
		await persist(removeBlock(live, path));
	}

	async function changeColumns(index: number, columns: number) {
		await persist(setGroupColumns(live, index, columns));
	}

	async function changeHeight(index: number, height?: PageRowHeight) {
		await persist(setGroupMinHeight(live, index, height));
	}

	async function moveRow(index: number, to: number) {
		await persist(moveSibling(live, index, to));
	}

	async function moveBlock(groupIndex: number, from: number, to: number) {
		await persist(moveInGroup(live, groupIndex, from, to));
	}

	const gridChoices = [
		{ columns: 1, label: "Full width", icon: SquareIcon },
		{ columns: 2, label: "2 columns", icon: Columns2Icon },
		{ columns: 3, label: "3 columns", icon: Columns3Icon },
		{ columns: 4, label: "4 columns", icon: Columns4Icon },
	];
	const heightChoices: Array<{ value?: PageRowHeight; label: string }> = [
		{ value: undefined, label: "Default" },
		{ value: "s", label: "Compact" },
		{ value: "m", label: "Medium" },
		{ value: "l", label: "Tall" },
		{ value: "xl", label: "Extra tall" },
	];

	function countLabel(count: number, singular: string): string {
		return `${count} ${count === 1 ? singular : `${singular}s`}`;
	}
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
								Add section
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#each gridChoices as choice (choice.columns)}
								{@const Icon = choice.icon}
								<DropdownMenu.Item onSelect={() => addGrid(choice.columns)}>
									<Icon />
									{choice.label} section
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button onclick={stopEdit} data-testid="page-done">
						<CheckIcon data-icon="inline-start" />
						Finish editing
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
					{editing ? "Add a section, then choose the blocks it should contain." : "Edit this page to add blocks."}
				</Empty.Description>
			</Empty.Header>
			{#if editing}
				<Empty.Content>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props}>
									<PlusIcon data-icon="inline-start" />
									Add first section
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="center">
							<DropdownMenu.Group>
								{#each gridChoices as choice (choice.columns)}
									{@const Icon = choice.icon}
									<DropdownMenu.Item onSelect={() => addGrid(choice.columns)}>
										<Icon />
										{choice.label}
									</DropdownMenu.Item>
								{/each}
							</DropdownMenu.Group>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{/if}

	{#each live as block, index (index)}
		{#if block.kind === "group"}
			{#if editing}
				<Card.Root size="sm" class="h-auto">
					<Card.Header class="gap-0">
						<Card.Title>Section {index + 1}</Card.Title>
						<Card.Description>
							{countLabel(block.blocks.length, "block")} · {gridChoices.find((item) => item.columns === (block.columns ?? 1))?.label ?? "Full width"}
						</Card.Description>
						<Card.Action class="flex flex-wrap items-center justify-end gap-1">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button variant="outline" size="xs" {...props}>
											{gridChoices.find((item) => item.columns === (block.columns ?? 1))?.label ?? "Layout"}
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Group>
										{#each gridChoices as choice (choice.columns)}
											{@const Icon = choice.icon}
											<DropdownMenu.Item onSelect={() => changeColumns(index, choice.columns)}>
												<Icon />
												{choice.label}
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Group>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button variant="ghost" size="xs" {...props}>
											{heightChoices.find((item) => item.value === block.min_height)?.label ?? "Auto height"}
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Group>
										{#each heightChoices as choice (choice.value ?? "default")}
											<DropdownMenu.Item onSelect={() => changeHeight(index, choice.value)}>
												{choice.label}
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Group>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
							<Button
								variant="ghost"
								size="icon-sm"
								disabled={index === 0}
								onclick={() => moveRow(index, index - 1)}
							>
								<ArrowUpIcon />
								<span class="sr-only">Move row up</span>
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								disabled={index === live.length - 1}
								onclick={() => moveRow(index, index + 1)}
							>
								<ArrowDownIcon />
								<span class="sr-only">Move row down</span>
							</Button>
							<Button variant="ghost" size="icon-sm" onclick={() => remove([index])}>
								<Trash2Icon />
								<span class="sr-only">Remove section</span>
							</Button>
						</Card.Action>
					</Card.Header>
					<Card.Content class="p-2">
						<div class="{gridClass(block.columns ?? 1)} items-stretch {groupHeightClass(block)}">
					{#each block.blocks as child, childIndex (`${index}-${childIndex}`)}
						<div
							class="flex h-full flex-col overflow-hidden rounded-xl bg-surface-chrome p-1 {groupHeightClass(block)}"
						>
								<div class="flex min-h-9 items-center justify-between gap-2 px-2 py-1">
									<Badge variant="outline">{blockLabel(child)}</Badge>
									<div class="flex items-center gap-0.5">
									<Button
										size="icon-xs"
										variant="ghost"
										disabled={childIndex === 0}
										onclick={() => moveBlock(index, childIndex, childIndex - 1)}
									>
										<ArrowLeftIcon />
										<span class="sr-only">Move left</span>
									</Button>
									<Button
										size="icon-xs"
										variant="ghost"
										disabled={childIndex === block.blocks.length - 1}
										onclick={() => moveBlock(index, childIndex, childIndex + 1)}
									>
										<ArrowRightIcon />
										<span class="sr-only">Move right</span>
									</Button>
									<Button size="xs" variant="ghost" onclick={() => openSheet([index, childIndex])}>
										Edit
									</Button>
									<Button
										size="icon-xs"
										variant="ghost"
										onclick={() => remove([index, childIndex])}
									>
										<Trash2Icon />
										<span class="sr-only">Remove {blockLabel(child)}</span>
									</Button>
									</div>
								</div>
							<div class="flex min-h-0 flex-1 flex-col rounded-lg bg-background p-3">
								<Block node={child} rows={viewRows} ready={rowsReady} {spec} />
							</div>
						</div>
					{/each}
							<button
							type="button"
							class="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
							onclick={() => openPicker([index])}
							data-testid="add-block-slot"
						>
							<PlusIcon class="size-4" />
								Add block
							</button>
						</div>
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="{gridClass(block.columns ?? 1)} items-stretch {groupHeightClass(block)}">
					{#each block.blocks as child, childIndex (`${index}-${childIndex}`)}
						<div class="flex h-full min-h-0 flex-col {groupHeightClass(block)}">
							<Block node={child} rows={viewRows} ready={rowsReady} {spec} />
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div
				class={editing
					? "flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-surface-chrome p-1"
					: "h-full min-h-0"}
			>
				{#if editing}
					<div class="flex min-h-9 items-center justify-between gap-2 px-2 py-1">
						<Badge variant="outline">{blockLabel(block)}</Badge>
						<div class="flex items-center gap-0.5">
						<Button size="xs" variant="ghost" onclick={() => openSheet([index])}>Edit</Button>
						<Button size="icon-xs" variant="ghost" onclick={() => remove([index])}>
							<Trash2Icon />
							<span class="sr-only">Remove</span>
						</Button>
						</div>
					</div>
				{/if}
				<div class={editing ? "flex min-h-0 flex-1 flex-col rounded-lg bg-background p-3" : "h-full min-h-0"}>
					<Block node={block} rows={viewRows} ready={rowsReady} {spec} />
				</div>
			</div>
		{/if}
	{/each}

	{#if editing && live.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" class="h-12 w-full border-dashed" {...props}>
						<PlusIcon data-icon="inline-start" />
						Add section
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="center">
				<DropdownMenu.Group>
					{#each gridChoices as choice (choice.columns)}
						{@const Icon = choice.icon}
						<DropdownMenu.Item onSelect={() => addGrid(choice.columns)}>
							<Icon />
							{choice.label} section
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>

<BlockPicker bind:open={pickerOpen} onPick={pickBlock} />
<BlockSettings bind:open={sheetOpen} node={editingBlock} {spec} onSave={saveBlock} />
