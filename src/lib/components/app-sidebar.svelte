<script lang="ts">
	import { page } from "$app/state";
	import { session, runtime } from "$lib/app/session.svelte.ts";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { sampleApps } from "$lib/runtime/samples.ts";
	import BoxIcon from "@lucide/svelte/icons/box";
	import BoxesIcon from "@lucide/svelte/icons/boxes";
	import BracesIcon from "@lucide/svelte/icons/braces";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import CircuitBoardIcon from "@lucide/svelte/icons/circuit-board";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import FormInputIcon from "@lucide/svelte/icons/form-input";
	import HammerIcon from "@lucide/svelte/icons/hammer";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import TableIcon from "@lucide/svelte/icons/table";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";
	import type { ComponentProps } from "svelte";

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();

	const snap = $derived(session.snapshot);
	const spec = $derived(snap?.spec);
	const path = $derived(page.url.pathname);

	const views = $derived(spec?.views ?? []);
	const types = $derived(spec?.types ?? []);
	const pages = $derived((spec?.pages ?? []).filter((item) => !item.implicit));
	const flows = $derived((spec?.flows ?? []).filter((flow) => flow.expose?.includes("ui")));

	async function addWorkspace() {
		const name = prompt("Workspace name");
		if (!name) return;
		await runtime().createWorkspace(name);
	}

	async function addEnvironment() {
		const name = prompt("Environment name");
		if (!name) return;
		await runtime().createEnvironment(name);
	}

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
									<CircuitBoardIcon />
								</div>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">builder.run</span>
									<span class="truncate text-xs">{snap?.environment.name}</span>
								</div>
								<ChevronsUpDownIcon class="ms-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="min-w-56 rounded-lg" align="start">
						<DropdownMenu.Group>
							<DropdownMenu.Label>Environments</DropdownMenu.Label>
							{#each snap?.environments ?? [] as env (env.id)}
								<DropdownMenu.Item onSelect={() => runtime().switchEnvironment(env.id)}>
									<Building2Icon />
									{env.name}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={addEnvironment}>
							<PlusIcon />
							New environment
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton {...props}>
								<BoxesIcon />
								<span>{snap?.workspace.name}</span>
								<ChevronsUpDownIcon class="ms-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="min-w-56 rounded-lg" align="start">
						<DropdownMenu.Group>
							<DropdownMenu.Label>Workspaces</DropdownMenu.Label>
							{#each snap?.workspaces ?? [] as workspace (workspace.id)}
								<DropdownMenu.Item onSelect={() => runtime().switchWorkspace(workspace.id)}>
									{workspace.name}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={addWorkspace}>
							<PlusIcon />
							New workspace
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.Label>Gallery</DropdownMenu.Label>
							{#each sampleApps as sample (sample.key)}
								<DropdownMenu.Item onSelect={() => loadSample(sample.key)}>
									{sample.label}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>App</Sidebar.GroupLabel>
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
						<Sidebar.MenuButton isActive={path === `/v/${view.key}` || path === `/t/${view.source}`} tooltipContent={view.label}>
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
				{#each flows as flow (flow.id)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton tooltipContent={flow.label}>
							{#snippet child({ props })}
								<a href="/build/flows/{flow.key}" {...props}>
									<WorkflowIcon />
									<span>{flow.label}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Build</Sidebar.GroupLabel>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/types")} tooltipContent="Types">
						{#snippet child({ props })}
							<a href="/build/types" {...props}><BoxIcon /><span>Types</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/views")} tooltipContent="Views">
						{#snippet child({ props })}
							<a href="/build/views" {...props}><TableIcon /><span>Views</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/forms")} tooltipContent="Forms">
						{#snippet child({ props })}
							<a href="/build/forms" {...props}><FormInputIcon /><span>Forms</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/flows")} tooltipContent="Flows">
						{#snippet child({ props })}
							<a href="/build/flows" {...props}><WorkflowIcon /><span>Flows</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/pages")} tooltipContent="Pages">
						{#snippet child({ props })}
							<a href="/build/pages" {...props}><LayersIcon /><span>Pages</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/spec")} tooltipContent="Spec">
						{#snippet child({ props })}
							<a href="/build/spec" {...props}><BracesIcon /><span>Spec</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/build/actors")} tooltipContent="Actors">
						{#snippet child({ props })}
							<a href="/build/actors" {...props}><UsersIcon /><span>Actors</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
		<Sidebar.Group class="mt-auto">
			<Sidebar.GroupLabel>System</Sidebar.GroupLabel>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={path.startsWith("/diagnostics")} tooltipContent="Diagnostics">
						{#snippet child({ props })}
							<a href="/diagnostics" {...props}><HammerIcon /><span>Diagnostics</span></a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					<div class="grid flex-1 text-start text-sm leading-tight">
						<span class="truncate font-medium">{snap?.actor.name}</span>
						<span class="truncate text-xs">{snap?.actor.kind} · {snap?.actor.roles.join(", ")}</span>
					</div>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
