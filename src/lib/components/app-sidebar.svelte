<script lang="ts">
	import { page } from "$app/state";
	import { collectionLabel, featuredViews } from "$lib/app/labels.ts";
	import { session, runtime } from "$lib/app/session.svelte.ts";
	import { studioItems } from "$lib/app/studio.ts";
	import NameDialog from "$lib/components/name-dialog.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { sampleApps } from "$lib/runtime/samples.ts";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import BoxIcon from "@lucide/svelte/icons/box";
	import BriefcaseIcon from "@lucide/svelte/icons/briefcase";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import ReceiptIcon from "@lucide/svelte/icons/receipt";
	import SearchIcon from "@lucide/svelte/icons/search";
	import TableIcon from "@lucide/svelte/icons/table";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";
	import type { Component, ComponentProps } from "svelte";

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const snap = $derived(session.snapshot);
	const spec = $derived(snap?.spec);
	const path = $derived(page.url.pathname);
	const studio = $derived(path.startsWith("/build") || path.startsWith("/diagnostics"));

	const views = $derived(spec ? featuredViews(spec) : []);
	const types = $derived(spec?.types ?? []);
	const pages = $derived((spec?.pages ?? []).filter((item) => !item.implicit));

	let workspaceOpen = $state(false);
	let environmentOpen = $state(false);

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

	const typeIcons: Record<string, Component> = {
		organisation: Building2Icon,
		contact: UsersIcon,
		project: BriefcaseIcon,
		invoice: ReceiptIcon,
		expense: WalletIcon,
	};

	async function loadSample(key: string) {
		await runtime().loadSample(key);
	}
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton {...props} size="lg">
								<div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<LayersIcon />
								</div>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">{snap?.workspace.name}</span>
									<span class="truncate text-xs">{snap?.environment.name}</span>
								</div>
								<ChevronsUpDownIcon class="ms-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="min-w-56 rounded-lg" align="start">
						<DropdownMenu.Group>
							<DropdownMenu.Label>Apps</DropdownMenu.Label>
							{#each snap?.workspaces ?? [] as workspace (workspace.id)}
								<DropdownMenu.Item onSelect={() => runtime().switchWorkspace(workspace.id)}>
									{workspace.name}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.Item onSelect={() => (workspaceOpen = true)}>
								<PlusIcon />
								New app
							</DropdownMenu.Item>
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.Label>Templates</DropdownMenu.Label>
							{#each sampleApps as sample (sample.key)}
								<DropdownMenu.Item onSelect={() => loadSample(sample.key)}>
									{sample.label}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.Label>Places</DropdownMenu.Label>
							{#each snap?.environments ?? [] as env (env.id)}
								<DropdownMenu.Item onSelect={() => runtime().switchEnvironment(env.id)}>
									<Building2Icon />
									{env.name}
								</DropdownMenu.Item>
							{/each}
							<DropdownMenu.Item onSelect={() => (environmentOpen = true)}>
								<PlusIcon />
								New place
							</DropdownMenu.Item>
						</DropdownMenu.Group>
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
				<Sidebar.GroupLabel>Edit app</Sidebar.GroupLabel>
				<Sidebar.Menu>
					{#each studioItems as item (item.href)}
						{@const Icon = studioIcons[item.href] ?? BoxIcon}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								isActive={path === item.href || path.startsWith(`${item.href}/`)}
								tooltipContent={item.label}
							>
								{#snippet child({ props })}
									<a href={item.href} {...props}><Icon /><span>{item.label}</span></a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		{:else}
			<Sidebar.Group>
				<Sidebar.GroupLabel>Menu</Sidebar.GroupLabel>
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
					{#each views as view (view.id)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={path === `/v/${view.key}`} tooltipContent={view.label}>
								{#snippet child({ props })}
									<a href="/v/{view.key}" {...props}>
										<TableIcon />
										<span>{view.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
					{#each pages as item (item.id)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={path === `/p/${item.key}`} tooltipContent={item.label}>
								{#snippet child({ props })}
									<a href="/p/{item.key}" {...props}>
										<FileTextIcon />
										<span>{item.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
			{#if types.length}
				<Sidebar.Group>
					<Sidebar.GroupLabel>Records</Sidebar.GroupLabel>
					<Sidebar.Menu>
						{#each types as type (type.id)}
							{@const Icon = typeIcons[type.key] ?? BoxIcon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={path === `/t/${type.key}` || path.startsWith(`/t/${type.key}/`)} tooltipContent={collectionLabel(type)}>
									{#snippet child({ props })}
										<a href="/t/{type.key}" {...props}>
											<Icon />
											<span>{collectionLabel(type)}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.Group>
			{/if}
		{/if}
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			{#if !studio}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build")} tooltipContent="Edit app">
						{#snippet child({ props })}
							<a href="/build" {...props}>
								<PencilIcon />
								<span>Edit app</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					<div class="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
						{snap?.actor.name?.slice(0, 1) ?? "Y"}
					</div>
					<div class="grid flex-1 text-start text-sm leading-tight">
						<span class="truncate font-medium">{snap?.actor.name}</span>
						<span class="truncate text-xs">builder.run</span>
					</div>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>

<NameDialog
	bind:open={workspaceOpen}
	title="New app"
	description="A fresh app in this place. Shared organisations and contacts stay available."
	onSubmit={async (name) => {
		await runtime().createWorkspace(name);
	}}
/>
<NameDialog
	bind:open={environmentOpen}
	title="New place"
	description="A separate place for apps, people, and shared contacts."
	onSubmit={async (name) => {
		await runtime().createEnvironment(name);
	}}
/>
