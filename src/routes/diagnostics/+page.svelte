<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { buildTools, webmcpSupported } from "$lib/runtime/webmcp.ts";

	const tools = $derived(session.host ? buildTools(runtime()) : []);
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
				<Badge>{session.snapshot?.engine} · {session.snapshot?.backend}</Badge>
				{#each session.snapshot?.stores ?? [] as store (store.key)}
					<div class="text-sm">
						<div class="font-medium">{store.key === "directory" ? "Shared directory" : "This app"}</div>
						<div class="text-muted-foreground">{store.tables.join(", ") || "no tables yet"}</div>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Agent connection</Card.Title>
				<Card.Description>Whether this browser can register tools for an agent.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Badge variant={webmcpSupported() ? "default" : "secondary"}>
					{webmcpSupported() ? "Available in this browser" : "Not in this browser"}
				</Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Signed in as</Card.Title>
				<Card.Description>The local person using the app.</Card.Description>
			</Card.Header>
			<Card.Content class="text-sm">{session.snapshot?.actor.name}</Card.Content>
		</Card.Root>
	</div>
	<Card.Root>
		<Card.Header>
			<Card.Title>Tools</Card.Title>
			<Card.Description>Builder and app tools taken from the live spec. They register when an agent connection is present.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#each tools as tool (tool.name)}
				<div class="rounded-lg border px-3 py-2">
					<div class="text-sm font-medium">{tool.name}</div>
					<div class="text-sm text-muted-foreground">{tool.description}</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
