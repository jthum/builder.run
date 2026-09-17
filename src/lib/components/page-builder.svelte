<script lang="ts">
	import { goto } from "$app/navigation";
	import { startVerticalDrag, type VerticalDragSession } from "$lib/app/drag.ts";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { uniqueKey } from "$lib/runtime/ids.ts";
	import type { PageDef } from "$lib/runtime/model.ts";
	import { pageIconEntry, pageIconList, type PageIconKey } from "$lib/runtime/page-icons.ts";
	import { authoredNavPages, groupPagesByFolder, moveAuthoredPage, pageHref } from "$lib/runtime/widgets.ts";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { onDestroy, untrack } from "svelte";
	import { flip } from "svelte/animate";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.resolvedSpec);
	const authoredPages = $derived(spec ? authoredNavPages(spec) : []);
	let orderedPages = $state<PageDef[]>([]);
	let syncedPageOrder = "";
	const pages = $derived(orderedPages.length || !authoredPages.length ? orderedPages : authoredPages);
	const groups = $derived(groupPagesByFolder(pages));
	const folders = $derived(
		groups.map((group) => group.folder).filter((name): name is string => Boolean(name)),
	);

	let createOpen = $state(false);
	let createName = $state("");
	let createFolder = $state("");
	let createIcon = $state<PageIconKey>("page");
	let editingPage = $state<PageDef | null>(null);
	let folderFor = $state<PageDef | null>(null);
	let folderOpen = $state(false);
	let removePage = $state<PageDef | null>(null);
	let pending = $state(false);
	let dragKey = $state<string | null>(null);
	let dragSession: VerticalDragSession | null = null;
	let dragOrigin: PageDef[] = [];
	let pageList = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const signature = authoredPages.map((page) => `${page.key}\u0000${page.folder ?? ""}`).join("\u0001");
		if (signature === syncedPageOrder) return;
		syncedPageOrder = signature;
		untrack(() => {
			orderedPages = authoredPages;
		});
	});

	function openCreate(folder = "") {
		editingPage = null;
		createName = "";
		createFolder = folder;
		createIcon = "page";
		createOpen = true;
	}

	function pageCounts(page: PageDef): { sections: number; widgets: number } {
		const widgetsIn = (blocks: NonNullable<PageDef["blocks"]>): number =>
			blocks.reduce(
				(count, block) => count + (block.kind === "group" ? widgetsIn(block.blocks) : 1),
				0,
			);
		return {
			sections: page.blocks?.filter((block) => block.kind === "group").length ?? 0,
			widgets: widgetsIn(page.blocks ?? []),
		};
	}

	function openEdit(page: PageDef) {
		editingPage = page;
		createName = page.label;
		createFolder = page.folder ?? "";
		createIcon = pageIconEntry(page.icon).key;
		createOpen = true;
	}

	async function savePage(event: Event) {
		event.preventDefault();
		const name = createName.trim();
		if (!name || !spec) return;
		pending = true;
		try {
			if (editingPage) {
				await runtime().upsertPage({
					key: editingPage.key,
					label: name,
					icon: createIcon,
					folder: createFolder.trim(),
				});
				createOpen = false;
				editingPage = null;
				toast.success("Page updated");
				return;
			}
			const key = uniqueKey(
				name,
				spec.pages.map((page) => page.key),
				"page",
			);
			await runtime().upsertPage({
				key,
				label: name,
				icon: createIcon,
				folder: createFolder.trim() || undefined,
				blocks: [],
			});
			createOpen = false;
			toast.success("Page added");
			await goto(`/p/${key}?edit=1`);
		} finally {
			pending = false;
		}
	}

	async function setFolder(page: PageDef, folder: string) {
		await runtime().upsertPage({
			key: page.key,
			label: page.label,
			icon: page.icon,
			folder,
			blocks: page.blocks,
		});
	}

	async function setIcon(page: PageDef, icon: PageIconKey) {
		await runtime().upsertPage({
			key: page.key,
			label: page.label,
			icon,
			folder: page.folder,
			blocks: page.blocks,
		});
	}

	function openNewFolder(page: PageDef) {
		folderFor = page;
		folderOpen = true;
	}

	async function applyNewFolder(name: string) {
		if (!folderFor) return;
		await setFolder(folderFor, name);
		folderFor = null;
	}

	async function remove() {
		if (!removePage) return;
		await runtime().deletePage(removePage.key);
		toast.success("Page deleted");
		removePage = null;
	}

	function movePageBeside(key: string, targetKey: string, after: boolean) {
		if (key === targetKey) return;
		const source = pages.find((page) => page.key === key);
		const target = pages.find((page) => page.key === targetKey);
		if (!source || !target) return;
		const from = pages.findIndex((page) => page.key === key);
		const to = pages.findIndex((page) => page.key === targetKey);
		const sameFolder = (source.folder ?? "") === (target.folder ?? "");
		if (sameFolder && ((from < to && !after) || (from > to && after))) return;

		const next = pages.filter((page) => page.key !== key).map((page) => ({ ...page }));
		const moving = { ...source, folder: target.folder };
		if (!moving.folder) delete moving.folder;
		const targetIndex = next.findIndex((page) => page.key === targetKey);
		next.splice(targetIndex + (after ? 1 : 0), 0, moving);
		orderedPages = next;
	}

	function onPageDragMove(key: string, clientY: number) {
		if (!pageList) return;
		const bounds = pageList.getBoundingClientRect();
		const element = document.elementFromPoint(bounds.left + bounds.width / 2, clientY);
		const row = element?.closest<HTMLElement>("[data-page-key]");
		if (row && pageList.contains(row)) {
			const targetKey = row.dataset.pageKey;
			if (!targetKey) return;
			const rowBounds = row.getBoundingClientRect();
			movePageBeside(key, targetKey, clientY > rowBounds.top + rowBounds.height / 2);
			return;
		}

		const folderTarget = element?.closest<HTMLElement>("[data-page-folder]");
		if (!folderTarget || !pageList.contains(folderTarget)) return;
		const folder = folderTarget.dataset.pageFolder || null;
		const source = pages.find((page) => page.key === key);
		if ((source?.folder ?? null) !== folder) {
			orderedPages = moveAuthoredPage(pages, key, { folder });
		}
	}

	function onDragStart(key: string, event: PointerEvent) {
		const handle = event.currentTarget as HTMLElement;
		dragOrigin = [...pages];
		dragKey = key;
		dragSession = startVerticalDrag({
			event,
			container: pageList,
			item: handle.closest<HTMLElement>("[role=listitem]"),
			onMove: (clientY) => onPageDragMove(key, clientY),
			onDrop: async () => {
				const next = [...pages];
				dragSession = null;
				dragKey = null;
				await runtime().replaceAuthoredPages(next);
			},
			onCancel: () => {
				dragSession = null;
				orderedPages = dragOrigin;
				dragKey = null;
			},
		});
		if (!dragSession) dragKey = null;
	}

	onDestroy(() => dragSession?.cancel());
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Pages"
		description="Build the screens people use, then arrange how they appear in the app."
	>
		{#snippet actions()}
			<Button onclick={() => openCreate()} data-testid="add-page">
				<PlusIcon data-icon="inline-start" />
				Add page
			</Button>
		{/snippet}
	</PageHeader>

	{#if !pages.length}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon"><LayersIcon /></Empty.Media>
				<Empty.Title>No pages yet</Empty.Title>
				<Empty.Description>
					Home is already there. Add a page when you want another screen in the menu. Record lists
					live under Records.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={() => openCreate()}>Add page</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="flex flex-col gap-4" bind:this={pageList}>
			{#if folders.length && dragKey}
				<div
					data-page-folder=""
					class="rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground"
				>
					Drop here to move the page out of its folder.
				</div>
			{/if}
			{#each groups as group (group.folder ?? "__root")}
				<Card.Root size="sm" class="h-auto" data-page-folder={group.folder ?? ""}>
					<Card.Header class="gap-0" role="group" aria-label={group.folder ? `Folder ${group.folder}` : "Pages outside folders"}>
						<Card.Title class="flex items-center gap-2">
							{#if group.folder}<FolderIcon class="size-4 text-muted-foreground" />{/if}
							{group.folder ?? "Pages"}
						</Card.Title>
						<Card.Description>
							{group.folder ? "Grouped together in the app navigation." : "Shown directly under Home."}
						</Card.Description>
						<Card.Action class="flex items-center gap-2">
							<Badge variant="outline">{group.pages.length}</Badge>
							<Button variant="ghost" size="xs" onclick={() => openCreate(group.folder ?? "")}>
								<PlusIcon data-icon="inline-start" />
								Add page
							</Button>
						</Card.Action>
					</Card.Header>
					<Card.Content class="p-0" role="list">
						{#each group.pages as item (item.id)}
							{@const Icon = pageIconEntry(item.icon).icon}
							{@const counts = pageCounts(item)}
							<div
								role="listitem"
								data-page-key={item.key}
								animate:flip={{ duration: 160 }}
								class="flex min-h-16 items-center gap-2 border-b px-3 py-2.5 last:border-b-0 {dragKey ===
								item.key
									? 'pointer-events-none opacity-0'
									: ''}"
							>
								<button
									type="button"
									class="touch-none cursor-grab px-1 text-muted-foreground select-none hover:text-foreground active:cursor-grabbing"
									aria-label="Drag to reorder"
									onpointerdown={(event) => onDragStart(item.key, event)}
								>
									<GripVerticalIcon class="size-4" />
								</button>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="outline" size="icon-sm" {...props} aria-label="Change page icon">
												<Icon />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start" class="max-h-72 overflow-y-auto">
										<DropdownMenu.Group>
											{#each pageIconList as choice (choice.key)}
												{@const Icon = choice.icon}
												<DropdownMenu.Item onSelect={() => setIcon(item, choice.key)}>
													<Icon />
													{choice.label}
												</DropdownMenu.Item>
											{/each}
										</DropdownMenu.Group>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
								<a href={pageHref(item)} class="min-w-0 flex-1 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
									<div class="font-medium">{item.label}</div>
									<div class="text-sm text-muted-foreground">
										{counts.sections} {counts.sections === 1 ? "section" : "sections"} · {counts.widgets}
										{counts.widgets === 1 ? "widget" : "widgets"}
									</div>
								</a>
								<Button variant="ghost" size="sm" class="hidden sm:inline-flex" href={pageHref(item)}>
									Edit layout
									<ArrowRightIcon data-icon="inline-end" />
								</Button>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="ghost" size="icon-sm" {...props} aria-label="Page actions">
												<EllipsisIcon />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Group>
											<DropdownMenu.Item onSelect={() => goto(pageHref(item))}>Open</DropdownMenu.Item>
											<DropdownMenu.Item onSelect={() => openEdit(item)}>Edit</DropdownMenu.Item>
											<DropdownMenu.Sub>
												<DropdownMenu.SubTrigger>
													<FolderIcon />
													Folder
												</DropdownMenu.SubTrigger>
												<DropdownMenu.SubContent>
													<DropdownMenu.Group>
														<DropdownMenu.Item onSelect={() => setFolder(item, "")}>
															No folder
														</DropdownMenu.Item>
														{#each folders as name (name)}
															<DropdownMenu.Item onSelect={() => setFolder(item, name)}>
																{name}
															</DropdownMenu.Item>
														{/each}
														<DropdownMenu.Separator />
														<DropdownMenu.Item onSelect={() => openNewFolder(item)}>
															New folder…
														</DropdownMenu.Item>
													</DropdownMenu.Group>
												</DropdownMenu.SubContent>
											</DropdownMenu.Sub>
										</DropdownMenu.Group>
										<DropdownMenu.Separator />
										<DropdownMenu.Group>
											<DropdownMenu.Item variant="destructive" onSelect={() => (removePage = item)}>
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Group>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={savePage}>
			<Dialog.Header>
				<Dialog.Title>{editingPage ? "Edit page" : "New page"}</Dialog.Title>
				<Dialog.Description>
					{editingPage
						? "Change how this page appears in the app."
						: "Shows under Home. Put it in a folder if you like."}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body>
				<Field.FieldGroup>
					<Field.Field>
						<Field.Label>Name</Field.Label>
						<Input bind:value={createName} placeholder="Weekly review" autofocus />
					</Field.Field>
					<Field.Field>
						<Field.Label>Icon</Field.Label>
						<div class="flex flex-wrap gap-1">
							{#each pageIconList as choice (choice.key)}
								{@const Icon = choice.icon}
								<Button
									type="button"
									variant={createIcon === choice.key ? "secondary" : "ghost"}
									size="icon-sm"
									onclick={() => (createIcon = choice.key)}
									aria-label={choice.label}
									aria-pressed={createIcon === choice.key}
								>
									<Icon />
								</Button>
							{/each}
						</div>
					</Field.Field>
					<Field.Field>
						<Field.Label>Folder</Field.Label>
						<Input bind:value={createFolder} placeholder="Optional — e.g. Finance" list="page-folders" />
						<datalist id="page-folders">
							{#each folders as name (name)}
								<option value={name}></option>
							{/each}
						</datalist>
					</Field.Field>
				</Field.FieldGroup>
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !createName.trim()}>
					{editingPage ? "Save changes" : "Create page"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<NameDialog
	bind:open={folderOpen}
	title="New folder"
	description="Pages in this folder appear together under Home."
	label="Folder name"
	confirm="Move here"
	onSubmit={applyNewFolder}
/>

<AlertDialog.Root open={Boolean(removePage)} onOpenChange={(open) => !open && (removePage = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {removePage?.label}?</AlertDialog.Title>
			<AlertDialog.Description>This removes the page from the app menu. It cannot be undone.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={remove}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
