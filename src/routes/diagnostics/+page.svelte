<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import { buildTools, webmcpSupported } from "$lib/runtime/webmcp.ts";
	import * as Badge from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { runtime } from "$lib/app/session.svelte.ts";

	const tools = $derived(session.host ? buildTools(runtime()) : []);
</script>

<div class="flex flex-col gap-4">
	<h1 class="text-2xl font-semibold">Diagnostics</h1>
	<div class="grid gap-4 md:grid-cols-3">
		<Card.Root>
			<Card.Header>
				<Card.Title>Persistence</Card.Title>
				<Card.Description>How this browser keeps the environment.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Badge.Badge>{session.snapshot?.backend}</Badge.Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>WebMCP</Card.Title>
				<Card.Description>document.modelContext</Card.Description>
			</Card.Header>
			<Card.Content>
				<Badge.Badge variant={webmcpSupported() ? "default" : "secondary"}>
					{webmcpSupported() ? "available" : "not in this browser"}
				</Badge.Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>Actor</Card.Title>
			</Card.Header>
			<Card.Content class="text-sm">
				{session.snapshot?.actor.name} · {session.snapshot?.actor.kind}
			</Card.Content>
		</Card.Root>
	</div>
	<Card.Root>
		<Card.Header>
			<Card.Title>Registered capability surface</Card.Title>
			<Card.Description>
				Builder and app tools derived from the live spec. They register when WebMCP is present.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			{#each tools as tool (tool.name)}
				<div class="rounded-lg border px-3 py-2">
					<div class="font-mono text-sm">{tool.name}</div>
					<div class="text-sm text-muted-foreground">{tool.description}</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
