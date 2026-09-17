<script lang="ts">
	import { runtime, session, wipeAllLocalData } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import { buildTools, toolSurface, webmcpSupported } from "$lib/runtime/webmcp.ts";
	import { toast } from "svelte-sonner";

	const tools = $derived.by(() => {
		void session.revision;
		return session.host ? buildTools(runtime(), { appTools: session.webmcpToolMode }) : [];
	});
	const builderTools = $derived(tools.filter((tool) => toolSurface(tool) === "builder"));
	const appTools = $derived(tools.filter((tool) => toolSurface(tool) === "app"));
	let toolTab = $state("builder");

	let wipeOpen = $state(false);
	let wiping = $state(false);

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
				{#if session.diagnostics?.catalog}
					<div class="text-sm">
						<div class="font-medium">Control</div>
						<div class="text-muted-foreground">
							{session.diagnostics.catalog.database}: {session.diagnostics.catalog.tables.join(", ") || "no tables yet"}
						</div>
					</div>
				{/if}
				{#each session.diagnostics?.stores ?? [] as store (store.key)}
					<div class="text-sm">
						<div class="font-medium">{store.key === "space" ? store.label : "This app"}</div>
						<div class="text-muted-foreground">
							{store.database}: {store.tables.join(", ") || "no tables yet"}
						</div>
					</div>
				{/each}
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
