<script lang="ts">
	import { toolContext, session, wipeAllLocalData } from "$lib/app/session.svelte.ts";
	import { PageHeader } from "@jthum/framework/svelte/ui/page-header";
	import * as AlertDialog from "@jthum/framework/svelte/ui/alert-dialog";
	import { Badge } from "@jthum/framework/svelte/ui/badge";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";
	import * as Empty from "@jthum/framework/svelte/ui/empty";
	import { Spinner } from "@jthum/framework/svelte/ui/spinner";
	import * as Table from "@jthum/framework/svelte/ui/table";
	import * as Tabs from "@jthum/framework/svelte/ui/tabs";
	import { buildTools, toolSurface, webmcpSupported } from "$lib/app/webmcp.ts";
	import { toast } from "svelte-sonner";

	const tools = $derived.by(() => {
		void session.revision;
		return session.framework ? buildTools(toolContext, { appTools: session.webmcpToolMode }) : [];
	});
	const builderTools = $derived(tools.filter((tool) => toolSurface(tool) === "builder"));
	const appTools = $derived(tools.filter((tool) => toolSurface(tool) === "app"));
	let toolTab = $state("builder");

	let wipeOpen = $state(false);
	let wiping = $state(false);
	const databases = $derived(session.diagnostics?.databases ?? []);

	function databaseKind(kind: (typeof databases)[number]["kind"]): string {
		if (kind === "control") return "Control";
		if (kind === "space") return "Space";
		if (kind === "app") return "App";
		if (kind === "scope") return "Scope";
		return "Database";
	}

	function formatBytes(bytes?: number): string {
		if (bytes == null) return "—";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function wipe() {
		wiping = true;
		try {
			await wipeAllLocalData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete local data");
			wiping = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<PageHeader title="Inspect" description="Storage, browser capabilities, and the tools an agent can call. This screen is for debugging, not day-to-day use." />
	<div class="grid gap-4 md:grid-cols-3">
		<Card.Root>
			<Card.Header>
				<Card.Title>Storage</Card.Title>
				<Card.Description>Records live in SQLite tables on this device.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2">
				<Badge>{session.diagnostics?.engine} · {session.diagnostics?.backend}</Badge>
				<div class="text-sm">
					<div class="font-medium">{databases.length} database{databases.length === 1 ? "" : "s"}</div>
					<div class="text-muted-foreground">
						{#if session.diagnostics?.capacity}
							{session.diagnostics.capacity.used} of {session.diagnostics.capacity.total} OPFS file slots in use
						{:else}
							{session.diagnostics?.database}
						{/if}
					</div>
				</div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Agent connection</Card.Title>
				<Card.Description>Whether this browser can register tools for an agent.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				<Badge variant={webmcpSupported() ? "default" : "secondary"}>
					{webmcpSupported() ? "Available in this browser" : "Not in this browser"}
				</Badge>
				<Badge variant="secondary">
					{session.webmcpToolMode === "typed" ? "Typed tools" : "Compact tools"}
				</Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Signed in as</Card.Title>
				<Card.Description>The local person using the app.</Card.Description>
			</Card.Header>
			<Card.Content class="text-sm">{session.actor?.name}</Card.Content>
		</Card.Root>
	</div>
	<Card.Root>
		<Card.Header>
			<Card.Title>Database files</Card.Title>
			<Card.Description>
				The catalog holds control data. Spaces, apps, and configured module scopes keep their records isolated.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if databases.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Owner</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head>Logical file</Table.Head>
							<Table.Head class="text-end">Size</Table.Head>
							<Table.Head class="text-end">State</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each databases as database (database.name)}
							<Table.Row>
								<Table.Cell class="font-medium">{database.label}</Table.Cell>
								<Table.Cell><Badge variant="secondary">{databaseKind(database.kind)}</Badge></Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground">{database.name}</Table.Cell>
								<Table.Cell class="text-end tabular-nums">{formatBytes(database.bytes)}</Table.Cell>
								<Table.Cell class="text-end">
									<Badge variant={database.open ? "default" : "outline"}>
										{database.open ? "Open" : "Stored"}
									</Badge>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No database files reported</Empty.Title>
						<Empty.Description>The active persistence backend did not expose a file inventory.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Title>Tools</Card.Title>
			<Card.Description>
				Builder tools shape the spec. App tools use the selected compact or typed record surface,
				plus exposed views and agent workflows. They register when an agent connection is present.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Tabs.Root bind:value={toolTab} class="gap-4">
				<Tabs.List
					class="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto p-1 group-data-horizontal/tabs:h-auto"
				>
					<Tabs.Trigger value="builder" class="h-8 flex-none gap-2 px-3">
						Builder
						<span class="text-xs text-muted-foreground tabular-nums">{builderTools.length}</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="app" class="h-8 flex-none gap-2 px-3">
						This app
						<span class="text-xs text-muted-foreground tabular-nums">{appTools.length}</span>
					</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="builder" class="flex flex-col gap-2">
					{#each builderTools as tool (tool.name)}
						<div class="rounded-lg border px-3 py-2">
							<div class="text-sm font-medium">{tool.name}</div>
							<div class="text-sm text-muted-foreground">{tool.description}</div>
						</div>
					{/each}
				</Tabs.Content>
				<Tabs.Content value="app" class="flex flex-col gap-2">
					{#if appTools.length}
						{#each appTools as tool (tool.name)}
							<div class="rounded-lg border px-3 py-2">
								<div class="text-sm font-medium">{tool.name}</div>
								<div class="text-sm text-muted-foreground">{tool.description}</div>
							</div>
						{/each}
					{:else}
						<Empty.Root class="border-none py-8">
							<Empty.Header>
								<Empty.Title>No app tools yet</Empty.Title>
								<Empty.Description>
									Record tools appear when you add a type. Workflow tools appear when a workflow is exposed
									to the agent.
								</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>
	<div class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-muted-foreground">Danger zone</h2>
		<Card.Root>
			<Card.Header>
				<Card.Title>Delete all local data</Card.Title>
				<Card.Description>
					Removes the catalog, every space file, and leftover IndexedDB on this device. The page
					reloads and starts over. Development only — this cannot be undone.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button variant="destructive" onclick={() => (wipeOpen = true)} data-testid="wipe-local-data">
					Delete all data
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
</div>

<AlertDialog.Root bind:open={wipeOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete all local data?</AlertDialog.Title>
			<AlertDialog.Description>
				Catalog, personal space, apps, and records on this device are removed. After reload you get a
				fresh personal space. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={wiping}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				onclick={wipe}
				disabled={wiping}
				data-testid="wipe-local-data-confirm"
			>
				{#if wiping}<Spinner data-icon="inline-start" />{/if}
				Delete all data
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
