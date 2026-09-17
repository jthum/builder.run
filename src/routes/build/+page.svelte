<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import { studioItems } from "$lib/app/studio.ts";
	import DeleteAppDialog from "$lib/components/delete-app-dialog.svelte";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Button } from "@jthum/framework/svelte/ui/button";
	import * as Card from "@jthum/framework/svelte/ui/card";

	let deleteOpen = $state(false);
	const appName = $derived(session.app?.name ?? "this app");
</script>

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-6">
		<PageHeader
			title="Edit app"
			description="Change what {appName} keeps, shows, and does. Add types, views, and rules — the app updates immediately."
		/>
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each studioItems as item (item.href)}
				<a href={item.href} class="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
					<Card.Root class="h-full transition-colors hover:bg-foreground/[0.04]">
						<Card.Header>
							<Card.Title>{item.label}</Card.Title>
							<Card.Description>{item.description}</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	</div>
	<div class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-muted-foreground">Danger zone</h2>
		<Card.Root>
			<Card.Header>
				<Card.Title>Delete {appName}</Card.Title>
				<Card.Description>
					Removes this app and its records. Shared organisations and contacts stay. You will type the
					name to confirm.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button variant="destructive" onclick={() => (deleteOpen = true)}>Delete app</Button>
			</Card.Footer>
		</Card.Root>
	</div>
</div>

<DeleteAppDialog bind:open={deleteOpen} />
