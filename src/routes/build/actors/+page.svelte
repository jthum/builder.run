<script lang="ts">
	import { session } from "$lib/app/session.svelte.ts";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import * as Table from "$lib/components/ui/table/index.js";

	const actors = $derived(session.snapshot?.environment.actors ?? []);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Actors</h1>
		<p class="text-muted-foreground">Every user is an actor; not every actor is a user. Roles hang on the actor.</p>
	</div>
	<Alert.Root>
		<Alert.Title>No permission engine yet</Alert.Title>
		<Alert.Description>
			The local human actor is admin. Identity/auth and agent runtimes bind later; they do not replace actors.
		</Alert.Description>
	</Alert.Root>
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Name</Table.Head>
				<Table.Head>Kind</Table.Head>
				<Table.Head>Roles</Table.Head>
				<Table.Head>Id</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each actors as actor (actor.id)}
				<Table.Row>
					<Table.Cell>{actor.name}</Table.Cell>
					<Table.Cell>{actor.kind}</Table.Cell>
					<Table.Cell>{actor.roles.join(", ")}</Table.Cell>
					<Table.Cell class="font-mono text-xs">{actor.id}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
