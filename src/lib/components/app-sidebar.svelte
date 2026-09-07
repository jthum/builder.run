<script lang="ts">
	import { page } from "$app/state";
	import { initialsFromName, toneFromAccent, toneFromName } from "$lib/app/color.ts";
	import { collectionLabel, featuredViews, spaceLabel } from "$lib/app/labels.ts";
	import { chrome, openNewApp, session, runtime } from "$lib/app/session.svelte.ts";
	import { studioGroupOrder, studioItems } from "$lib/app/studio.ts";
	import SidebarNavGroup from "$lib/components/sidebar-nav-group.svelte";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import NewAppDialog from "$lib/components/new-app-dialog.svelte";
	import ProfileDialog from "$lib/components/profile-dialog.svelte";
	import SpaceSettingsDialog from "$lib/components/space-settings-dialog.svelte";
	import * as Avatar from "$lib/components/ui/avatar/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import BoxIcon from "@lucide/svelte/icons/box";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import TableIcon from "@lucide/svelte/icons/table";
	import UserIcon from "@lucide/svelte/icons/user";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";
	import type { PageDef, TypeDef } from "$lib/runtime/model.ts";
	import { pageIconEntry } from "$lib/runtime/page-icons.ts";
	import { authoredNavPages, groupPagesByFolder, pageHref } from "$lib/runtime/widgets.ts";
	import type { Component, ComponentProps } from "svelte";

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const snap = $derived(session.snapshot);
	const spec = $derived(snap?.spec);
	const path = $derived(page.url.pathname);
	const studio = $derived(path.startsWith("/build") || path.startsWith("/diagnostics"));
	const space = $derived(spaceLabel(snap?.space.name));

	const views = $derived(spec ? featuredViews(spec) : []);
	const types = $derived(spec?.types ?? []);
	const localTypes = $derived(types.filter((type) => !type.expose));
	const sharedTypes = $derived(types.filter((type) => type.expose));
	const navPages = $derived(spec ? authoredNavPages(spec) : []);
	const pageGroups = $derived(groupPagesByFolder(navPages));
	const studioSections = $derived(
		studioGroupOrder.map((label) => ({
			label,
			items: studioItems.filter((item) => item.group === label),
		})),
	);

	let spaceOpen = $state(false);
	let profileOpen = $state(false);
	let settingsOpen = $state(false);


	const studioIcons: Record<string, Component> = {
		"/build/types": BoxIcon,
		"/build/views": TableIcon,
		"/build/forms": FormInputIcon,
		"/build/flows": WorkflowIcon,
		"/build/pages": LayersIcon,
		"/build/actors": UsersIcon,
		"/build/spec": FileTextIcon,
		"/diagnostics": SearchIcon,
	};

	const appTone = $derived(toneFromAccent(snap?.space.appearance?.accent));
	const actorTone = $derived(toneFromName(snap?.actor.name ?? "You"));
	const initial = $derived(initialsFromName(snap?.actor.name ?? "You"));
</script>

{#snippet recordLink(type: TypeDef)}
	<Sidebar.MenuSubItem>
		<Sidebar.MenuSubButton
			href="/t/{type.key}"
			isActive={path === `/t/${type.key}` || path.startsWith(`/t/${type.key}/`)}
		>
			<span>{collectionLabel(type)}</span>
		</Sidebar.MenuSubButton>
	</Sidebar.MenuSubItem>
{/snippet}

{#snippet pageLink(item: PageDef)}
	{@const Icon = pageIconEntry(item.icon).icon}
	<Sidebar.MenuItem>
		<Sidebar.MenuButton
			isActive={path === pageHref(item) || path.startsWith(`${pageHref(item)}/`)}
			tooltipContent={item.label}
		>
			{#snippet child({ props })}
				<a href={pageHref(item)} {...props}>
					<Icon />
					<span>{item.label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

<Sidebar.Root
	bind:ref
	variant="inset"
	{...restProps}
>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								{...props}
								size="lg"
								variant="outline"
								class="bg-background"
							>
								<div
									class="flex aspect-square size-8 items-center justify-center rounded-lg text-white"
									style="background-image: {appTone.gradient}"
								>
									<LayersIcon />
								</div>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">{snap?.app.name}</span>
									<span class="truncate text-xs text-muted-foreground group-hover/menu-button:text-muted-foreground">{space}</span>
								</div>
								<ChevronsUpDownIcon class="ms-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="min-w-56 rounded-lg" align="start">
						<DropdownMenu.Group>
							<DropdownMenu.Label>Apps</DropdownMenu.Label>
							{#each snap?.apps ?? [] as app (app.id)}
								<DropdownMenu.Item onSelect={() => runtime().switchApp(app.id)}>
									<span class="truncate">{app.name}</span>
									{#if app.id === snap?.app.id}
										<CheckIcon class="ms-auto" />
									{/if}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={() => openNewApp()}>
							<PlusIcon />
							New app
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		{#if studio}
			<Sidebar.Group>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton tooltipContent="Back to app">
							{#snippet child({ props })}
								<a href="/" {...props}>
									<ArrowLeftIcon />
									<span>Back to app</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Group>
			<Sidebar.Group>
				<Sidebar.Menu>
					{#each studioSections as section, index (section.label)}
						<Sidebar.MenuItem class={index > 0 ? "mt-3" : ""}>
							<div
								class="px-2 pb-0.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
							>
								{section.label}
							</div>
						</Sidebar.MenuItem>
						{#each section.items as item (item.href)}
							{@const Icon = studioIcons[item.href] ?? BoxIcon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									isActive={path === item.href || path.startsWith(`${item.href}/`)}
									tooltipContent={item.label}
								>
									{#snippet child({ props })}
										<a href={item.href} {...props}>
											<Icon />
											<span>{item.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		{:else}
			<Sidebar.Group>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={path === "/"} tooltipContent="Home">
							{#snippet child({ props })}
								<a href="/" {...props}>
									<LayoutDashboardIcon />
									<span>Home</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					{#each pageGroups as group (group.folder ?? "__root")}
						{#if group.folder}
							<SidebarNavGroup label={group.folder} icon={FolderIcon}>
								{#each group.pages as item (item.id)}
									{@const Icon = pageIconEntry(item.icon).icon}
									<Sidebar.MenuSubItem>
										<Sidebar.MenuSubButton
											href={pageHref(item)}
											isActive={path === pageHref(item) || path.startsWith(`${pageHref(item)}/`)}
										>
											<Icon />
											<span>{item.label}</span>
										</Sidebar.MenuSubButton>
									</Sidebar.MenuSubItem>
								{/each}
							</SidebarNavGroup>
						{:else}
							{#each group.pages as item (item.id)}
								{@render pageLink(item)}
							{/each}
						{/if}
					{/each}
					{#if views.length}
						<SidebarNavGroup class="mt-3" label="Views" icon={TableIcon}>
							{#each views as view (view.id)}
								<Sidebar.MenuSubItem>
									<Sidebar.MenuSubButton href="/v/{view.key}" isActive={path === `/v/${view.key}`}>
										<span>{view.label}</span>
									</Sidebar.MenuSubButton>
								</Sidebar.MenuSubItem>
							{/each}
						</SidebarNavGroup>
					{/if}
					{#if localTypes.length || sharedTypes.length}
						<SidebarNavGroup class="mt-3" label="Records" icon={BoxIcon}>
							{#each localTypes as type (type.id)}
								{@render recordLink(type)}
							{/each}
							{#if sharedTypes.length}
								<Sidebar.MenuSubItem>
									<div
										class="px-2 {localTypes.length
											? 'pt-1.5'
											: 'pt-0.5'} pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
									>
										{space}
									</div>
								</Sidebar.MenuSubItem>
								{#each sharedTypes as type (type.id)}
									{@render recordLink(type)}
								{/each}
							{/if}
						</SidebarNavGroup>
					{/if}
				</Sidebar.Menu>
			</Sidebar.Group>
		{/if}
	</Sidebar.Content>
	<Sidebar.Footer class="gap-3">
		{#if !studio}
			<Button href="/build" variant="outline" size="sm" class="w-full justify-start">
				<PencilIcon data-icon="inline-start" />
				Edit app
			</Button>
		{/if}
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								{...props}
								size="lg"
								variant="outline"
								class="bg-background"
							>
								<Avatar.Root class="size-8 rounded-lg">
									<Avatar.Fallback
										class="rounded-lg font-medium"
										style="background-color: {actorTone.background}; color: {actorTone.foreground}"
									>
										{initial}
									</Avatar.Fallback>
								</Avatar.Root>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">{snap?.actor.name}</span>
									<span class="truncate text-xs text-muted-foreground group-hover/menu-button:text-muted-foreground">{snap?.actor.email || space}</span>
								</div>
								<ChevronsUpDownIcon class="ms-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="min-w-56 rounded-lg" align="end" side="top">
						<DropdownMenu.Group>
							<DropdownMenu.Label class="font-normal">
								<div class="flex flex-col">
									<span class="font-medium">{snap?.actor.name}</span>
									<span class="text-xs text-muted-foreground">{snap?.actor.email || "No email yet"}</span>
								</div>
							</DropdownMenu.Label>
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={() => (profileOpen = true)}>
							<UserIcon />
							Profile
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={() => (settingsOpen = true)}>
							<SettingsIcon />
							Space settings
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger>
								<Building2Icon />
								Spaces
							</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent class="min-w-48">
								{#each snap?.spaces ?? [] as item (item.id)}
									<DropdownMenu.Item onSelect={() => runtime().switchSpace(item.id)}>
										<span class="truncate">{spaceLabel(item.name)}</span>
										{#if item.id === snap?.space.id}
											<CheckIcon class="ms-auto" />
										{/if}
									</DropdownMenu.Item>
								{/each}
								<DropdownMenu.Separator />
								<DropdownMenu.Item onSelect={() => (spaceOpen = true)}>
									<PlusIcon />
									New space
								</DropdownMenu.Item>
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
						<DropdownMenu.Separator />
						<DropdownMenu.Label class="text-xs font-normal text-muted-foreground">builder.run</DropdownMenu.Label>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>

<NewAppDialog bind:open={chrome.newAppOpen} preset={chrome.newAppPreset} />
<ProfileDialog bind:open={profileOpen} />
<SpaceSettingsDialog bind:open={settingsOpen} />
<NameDialog
	bind:open={spaceOpen}
	title="New space"
	description="A separate space for apps, people, and types you expose to those apps."
	confirm="Create space"
	onSubmit={async (name) => {
		await runtime().createSpace(name);
	}}
/>
