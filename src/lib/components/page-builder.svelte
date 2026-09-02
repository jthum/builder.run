<script lang="ts">
	import { goto } from "$app/navigation";
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { uniqueKey } from "$lib/runtime/ids.ts";
	import type { PageDef } from "$lib/runtime/model.ts";
	import { authoredNavPages, groupPagesByFolder, pageHref } from "$lib/runtime/widgets.ts";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	const spec = $derived(session.snapshot?.spec);
	const pages = $derived(spec ? authoredNavPages(spec) : []);
	const groups = $derived(groupPagesByFolder(pages));
	const folders = $derived(
		groups.map((group) => group.folder).filter((name): name is string => Boolean(name)),
	);

	let createOpen = $state(false);
	let createName = $state("");
	let createFolder = $state("");
	let folderFor = $state<PageDef | null>(null);
	let folderOpen = $state(false);
	let removePage = $state<PageDef | null>(null);
	let pending = $state(false);

	function openCreate(folder = "") {
		createName = "";
		createFolder = folder;
		createOpen = true;
	}

	async function create(event: Event) {
		event.preventDefault();
		const name = createName.trim();
		if (!name || !spec) return;
		pending = true;
		try {
			const key = uniqueKey(
				name,
				spec.pages.map((page) => page.key),
				"page",
			);
			await runtime().upsertPage({
				key,
				label: name,
				folder: createFolder.trim() || undefined,
				blocks: [
					{
						kind: "group",
						columns: 1,
						blocks: [
							{
								kind: "widget",
								widget: "heading",
								values: { title: name, description: "" },
							},
						],
					},
				],
			});
			createOpen = false;
			toast.success("Page added");
			await goto(`/p/${key}`);
		} finally {
			pending = false;
		}
	}

	async function setFolder(page: PageDef, folder: string) {
		await runtime().upsertPage({
			key: page.key,
			label: page.label,
			folder,
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
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Pages"
		description="The main screens in this app. Group them into folders for the menu under Home."
	>
		{#snippet actions()}
			<Button onclick={() => openCreate()}>
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
		<div class="flex flex-col gap-6">
			{#each groups as group (group.folder ?? "__root")}
				<div class="flex flex-col gap-2">
					{#if group.folder}
						<div class="flex items-center justify-between gap-2">
							<h2 class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								{group.folder}
							</h2>
							<Button variant="ghost" size="xs" onclick={() => openCreate(group.folder ?? "")}>
								<PlusIcon data-icon="inline-start" />
								Add
							</Button>
						</div>
					{/if}
					<div class="flex flex-col gap-2">
						{#each group.pages as item (item.id)}
							<Card.Root size="sm" class="transition-colors hover:bg-foreground/[0.04]">
								<Card.Header class="flex-row items-start justify-between gap-3">
									<a href={pageHref(item)} class="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
										<Card.Title>{item.label}</Card.Title>
										<Card.Description>
											{item.folder ? item.folder : "In the menu under Home"}
										</Card.Description>
									</a>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="ghost" size="icon-sm" {...props} aria-label="Page actions">
													<EllipsisIcon />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onSelect={() => goto(pageHref(item))}>Open</DropdownMenu.Item>
											<DropdownMenu.Sub>
												<DropdownMenu.SubTrigger>
													<FolderIcon />
													Folder
												</DropdownMenu.SubTrigger>
												<DropdownMenu.SubContent>
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
												</DropdownMenu.SubContent>
											</DropdownMenu.Sub>
											<DropdownMenu.Separator />
											<DropdownMenu.Item variant="destructive" onSelect={() => (removePage = item)}>
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Card.Header>
							</Card.Root>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={create}>
			<Dialog.Header>
				<Dialog.Title>New page</Dialog.Title>
				<Dialog.Description>Shows under Home. Put it in a folder if you like.</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class="flex flex-col gap-4">
				<Field.Field>
					<Field.Label>Name</Field.Label>
					<Input bind:value={createName} placeholder="Weekly review" autofocus />
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
			</Dialog.Body>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !createName.trim()}>Create page</Button>
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
