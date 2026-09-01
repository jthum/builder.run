<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import { studioItems } from "$lib/app/studio.ts";
	import PageHeader from "$lib/components/page-header.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Edit app"
		description="Change what {session.snapshot?.workspace.name ?? 'this app'} keeps, shows, and does. People using the app won't see this studio."
	/>
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each studioItems as item (item.href)}
			<a href={item.href} class="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
				<Card.Root class="h-full transition-colors hover:bg-muted/40">
					<Card.Header>
						<Card.Title>{item.label}</Card.Title>
						<Card.Description>{item.description}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
		{/each}
	</div>
</div>
