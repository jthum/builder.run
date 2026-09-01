<script lang="ts">
	import { runtime, session } from "$lib/app/session.svelte.ts";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { sampleApps } from "$lib/runtime/samples.ts";
	const spec = $derived(session.snapshot?.spec);
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{session.snapshot?.workspace.name}</h1>
		<p class="text-muted-foreground">
			{session.snapshot?.environment.name} · spec is canonical · {session.snapshot?.backend} persistence
		</p>
	</div>
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each spec?.types ?? [] as type (type.id)}
			<Card.Root>
				<Card.Header>
					<Card.Title>{type.label}</Card.Title>
					<Card.Description>{type.store}.{type.key} · {type.fields.length} fields</Card.Description>
				</Card.Header>
				<Card.Footer class="gap-2">
					<Button href="/t/{type.key}" size="sm">Open</Button>
					<Button href="/t/{type.key}/new" size="sm" variant="outline">New</Button>
				</Card.Footer>
			</Card.Root>
		{/each}
	</div>
	<div class="flex flex-col gap-3">
		<h2 class="text-lg font-medium">Gallery</h2>
		<div class="grid gap-4 md:grid-cols-3">
			{#each sampleApps as sample (sample.key)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{sample.label}</Card.Title>
						<Card.Description>{sample.description}</Card.Description>
					</Card.Header>
					<Card.Footer>
						<Button size="sm" variant="outline" onclick={() => runtime().loadSample(sample.key)}>Load</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	</div>
</div>
